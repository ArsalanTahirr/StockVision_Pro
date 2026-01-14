# StockVision Pro

StockVision Pro is an AI-powered stock prediction system that analyzes historical market data and provides next-day price predictions with technical analysis for multiple stock tickers.

---

## Features

- **Multi-stock prediction** - Supports AAPL, AMZN, GOOGL, META, MSFT, TSLA
- **LSTM-based deep learning models** - Individual models trained per ticker
- **Automatic technical indicators** - Calculates MA20, MA50, MA100, RSI
- **Real-time market data** - Fetches live data via Yahoo Finance API
- **Next-day price prediction** - AI-powered forecasting
- **BUY / SELL / HOLD recommendations** - Automated trading signals
- **Interactive charts** - Visualizes actual vs predicted prices
- **REST API + Web dashboard** - Full-stack Flask application

---

## Project Structure

```
StockVision_Pro/
│
├── app.py                 # Main Flask backend
├── api/                   # Vercel serverless entry
│   └── index.py
├── models/                # Trained LSTM models (.keras)
├── scalers/               # Feature scalers (.pkl)
├── templates/             # HTML frontend
│   └── index.html
├── requirements.txt
├── vercel.json
└── .gitignore
```

---

## Tech Stack

- **Python** - Core language
- **Flask** - Web framework
- **TensorFlow / Keras** - Deep learning models
- **NumPy & Pandas** - Data processing
- **Scikit-learn** - Feature scaling
- **Yahoo Finance (yfinance)** - Market data API
- **Vercel** - Serverless deployment

---

## Running Locally

### Install dependencies:

```bash
pip install -r requirements.txt
```

### Start the server:

```bash
python app.py
```

### Open in browser:

```
http://localhost:5000
```

---

## Output

The prediction response includes:

- Current price
- Predicted next-day price
- Price change and percentage
- BUY / SELL / HOLD recommendation
- Technical indicators (MA20, MA50, MA100, RSI)
- Historical and predicted chart data

---

## Deployment

StockVision Pro is deployed on **Vercel** as a serverless Flask API using a custom `api/index.py` entry point.

The frontend and backend are served from a single Vercel project.

---

## Notes

- Models and scalers are loaded dynamically per ticker
- Files are cached in memory for faster performance
- Model files are stored in `/models`
- Scalers are stored in `/scalers`

---

## License

This project is for **educational and research purposes only**.

It does not provide financial or investment advice.

---

## Author

**Arsalan Tahir** , **Usayd Arsalan** , **Bazyl Sheikh**

---

**Disclaimer:** This tool is for educational purposes. Always do your own research before making investment decisions.
