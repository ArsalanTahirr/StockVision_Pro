import sys
import os

from flask import Flask, render_template, request, jsonify
import numpy as np
import pandas as pd
import yfinance as yf
from datetime import date
from tensorflow import keras
import joblib
import time

DATA_CACHE = {}
CACHE_TTL = 60 * 30  # 30 minutes

# Absolute paths (Vercel-safe)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "models")
SCALERS_DIR = os.path.join(BASE_DIR, "scalers")

app = Flask(__name__)

# Dictionary to cache loaded models and scalers
loaded_models = {}

# Mapping of ticker symbols to file names (in case they differ)
TICKER_FILE_MAP = {
    'AAPL': 'AAPL',
    'AMZN': 'AMZN',
    'GOOGL': 'GOOGL',
    'META': 'META',
    'MSFT': 'MSFT',
    'TSLA': 'TESLA',  # Ticker is TSLA but files are named TESLA
}

# List of available tickers
AVAILABLE_TICKERS = list(TICKER_FILE_MAP.keys())

def get_model_paths(ticker):
    """Get model and scaler file paths for a given ticker (Vercel-safe absolute paths)"""
    ticker = ticker.upper()
    file_name = TICKER_FILE_MAP.get(ticker, ticker)

    # models in /models, scalers in /scalers
    model_path = os.path.join(MODELS_DIR, f"stock_model{file_name}.keras")
    scaler_path = os.path.join(SCALERS_DIR, f"scaler{file_name}.pkl")

    return model_path, scaler_path

def load_model_for_ticker(ticker):
    """Load model and scaler for a specific ticker"""
    ticker = ticker.upper()

    # Check if already loaded in cache
    if ticker in loaded_models:
        return loaded_models[ticker]['model'], loaded_models[ticker]['scaler'], None

    model_path, scaler_path = get_model_paths(ticker)

    # Check if files exist
    if not os.path.exists(model_path):
        return None, None, f"Model for {ticker} not found at {model_path}. Make sure it's committed to GitHub."

    if not os.path.exists(scaler_path):
        return None, None, f"Scaler for {ticker} not found at {scaler_path}. Make sure it's committed to GitHub."

    try:
        model = keras.models.load_model(model_path)
        scaler = joblib.load(scaler_path)

        # Cache the loaded model and scaler
        loaded_models[ticker] = {'model': model, 'scaler': scaler}

        print(f"Loaded model and scaler for {ticker}")
        return model, scaler, None

    except Exception as e:
        return None, None, f"Error loading model for {ticker}: {str(e)}"

def get_available_models():
    """Get list of tickers that have trained models available"""
    available = []
    for ticker in AVAILABLE_TICKERS:
        model_path, scaler_path = get_model_paths(ticker)
        if os.path.exists(model_path) and os.path.exists(scaler_path):
            available.append(ticker)
    return available

def compute_rsi(series, period=14):
    """Compute Relative Strength Index"""
    delta = series.diff()
    gain = delta.where(delta > 0, 0)
    loss = -delta.where(delta < 0, 0)
    avg_gain = gain.rolling(period).mean()
    avg_loss = loss.rolling(period).mean()
    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))
    return rsi

def prepare_data(ticker):
    """Download and prepare stock data for prediction"""
    try:
        start_date = "2014-01-01"
        end_date = date.today().strftime("%Y-%m-%d")

        now = time.time()

        if ticker in DATA_CACHE and now - DATA_CACHE[ticker]["time"] < CACHE_TTL:
            data = DATA_CACHE[ticker]["data"]
        else:
            data = yf.download(ticker, start=start_date, end=end_date, auto_adjust=True, progress=False)
            DATA_CACHE[ticker] = {"data": data, "time": now}


        if data.empty:
            return None, None, "No data found for this ticker symbol"

        df = data.copy()

        # Handle MultiIndex columns if present
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = [col[0] if col[0] != '' else col[1] for col in df.columns]

        # Feature engineering
        df['MA20'] = df['Close'].rolling(window=20).mean()
        df['MA50'] = df['Close'].rolling(window=50).mean()
        df['MA100'] = df['Close'].rolling(window=100).mean()
        df['RSI'] = compute_rsi(df['Close'], 14)

        # Drop NaN values and unnecessary columns
        df = df.dropna()
        df = df.drop(columns=['High', 'Low', 'Open', 'Volume'], axis=1, errors='ignore')

        if len(df) < 100:
            return None, None, "Not enough historical data for prediction"

        return df, data, None

    except Exception as e:
        return None, None, str(e)

def predict_stock(ticker):
    """Make predictions for the given stock ticker"""
    ticker = ticker.upper()

    model, scaler, load_error = load_model_for_ticker(ticker)
    if load_error:
        return None, load_error

    df, raw_data, error = prepare_data(ticker)
    if error:
        return None, error

    try:
        train_size = int(len(df) * 0.80)
        train = df[:train_size]
        test = df[train_size:]

        past_100_days = train[-100:]
        final_df = pd.concat([past_100_days, test], ignore_index=True)

        input_data = scaler.transform(final_df)

        x_test = []
        y_test_actual = []

        for i in range(100, input_data.shape[0]):
            x_test.append(input_data[i-100:i])
            y_test_actual.append(input_data[i, 0])

        x_test = np.array(x_test)
        y_test_actual = np.array(y_test_actual)

        y_pred_scaled = model.predict(x_test, verbose=0)

        dummy_pred = np.zeros((len(y_pred_scaled), 5))
        dummy_pred[:, 0] = y_pred_scaled[:, 0]
        y_pred_actual = scaler.inverse_transform(dummy_pred)[:, 0]

        dummy_actual = np.zeros((len(y_test_actual), 5))
        dummy_actual[:, 0] = y_test_actual
        y_actual = scaler.inverse_transform(dummy_actual)[:, 0]

        last_100_days = df[-100:]
        last_input = scaler.transform(last_100_days)
        x_input = np.array([last_input])
        next_pred_scaled = model.predict(x_input, verbose=0)

        dummy_next = np.zeros((1, 5))
        dummy_next[0, 0] = next_pred_scaled[0, 0]
        predicted_price = scaler.inverse_transform(dummy_next)[0, 0]

        current_price = float(df['Close'].iloc[-1])
        price_change = predicted_price - current_price
        percent_change = (price_change / current_price) * 100

        chart_data = raw_data['Close'].tail(60).reset_index()
        chart_data.columns = ['Date', 'Close']
        chart_data['Date'] = chart_data['Date'].dt.strftime('%Y-%m-%d')

        if ticker in DATA_CACHE and "info" in DATA_CACHE[ticker]:
            info = DATA_CACHE[ticker]["info"]
        else:
            stock = yf.Ticker(ticker)
            info = stock.info
            DATA_CACHE.setdefault(ticker, {})["info"] = info


        result = {
            'ticker': ticker.upper(),
            'company_name': info.get('longName', ticker.upper()),
            'current_price': round(current_price, 2),
            'predicted_price': round(predicted_price, 2),
            'price_change': round(price_change, 2),
            'percent_change': round(percent_change, 2),
            'recommendation': 'BUY' if percent_change > 1 else ('SELL' if percent_change < -1 else 'HOLD'),
            'market_cap': info.get('marketCap', 'N/A'),
            'pe_ratio': info.get('trailingPE', 'N/A'),
            'fifty_two_week_high': info.get('fiftyTwoWeekHigh', 'N/A'),
            'fifty_two_week_low': info.get('fiftyTwoWeekLow', 'N/A'),
            'ma20': round(float(df['MA20'].iloc[-1]), 2),
            'ma50': round(float(df['MA50'].iloc[-1]), 2),
            'ma100': round(float(df['MA100'].iloc[-1]), 2),
            'rsi': round(float(df['RSI'].iloc[-1]), 2),
            'chart_dates': chart_data['Date'].tolist(),
            'chart_prices': [round(float(p), 2) for p in chart_data['Close'].tolist()],
            'actual_prices': [round(float(p), 2) for p in y_actual.tolist()],
            'predicted_prices': [round(float(p), 2) for p in y_pred_actual.tolist()],
            'comparison_labels': list(range(1, len(y_actual) + 1))
        }

        return result, None

    except Exception as e:
        return None, str(e)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/available_models', methods=['GET'])
def available_models():
    available = get_available_models()
    return jsonify({'available_tickers': available})

@app.route('/predict', methods=['POST'])
def predict():
    data = request.get_json()
    ticker = data.get('ticker', '').strip().upper()

    if not ticker:
        return jsonify({'error': 'Please enter a stock ticker symbol'}), 400

    result, error = predict_stock(ticker)
    if error:
        return jsonify({'error': error}), 400

    return jsonify(result)

@app.route('/health')
def health():
    available = get_available_models()
    return jsonify({
        'status': 'healthy',
        'available_models': available,
        'loaded_models': list(loaded_models.keys())
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)
