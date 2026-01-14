// DOM Elements
const tickerInput = document.getElementById('tickerInput');
const predictBtn = document.getElementById('predictBtn');
const loadingState = document.getElementById('loadingState');
const errorState = document.getElementById('errorState');
const errorMessage = document.getElementById('errorMessage');
const resultsSection = document.getElementById('resultsSection');

// Chart instances
let priceChart = null;
let comparisonChart = null;

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    loadSavedTheme();
    initializeEventListeners();
    loadAvailableModels();
});

async function loadAvailableModels() {
    const container = document.getElementById('availableModels');
    
    try {
        const response = await fetch('/available_models');
        const data = await response.json();
        
        if (data.available_tickers && data.available_tickers.length > 0) {
            container.innerHTML = data.available_tickers.map(ticker => 
                `<button class="ticker-chip" data-ticker="${ticker}">${ticker}</button>`
            ).join('');
            
            // Add click listeners to new chips
            container.querySelectorAll('.ticker-chip').forEach(chip => {
                chip.addEventListener('click', () => {
                    tickerInput.value = chip.dataset.ticker;
                    handlePredict();
                });
            });
        } else {
            container.innerHTML = `
                <span class="no-models-msg">
                    <i class="fas fa-exclamation-circle"></i>
                    No trained models available. Please run the notebook to train models.
                </span>
            `;
        }
    } catch (error) {
        container.innerHTML = `
            <span class="no-models-msg">
                <i class="fas fa-exclamation-circle"></i>
                Error loading models
            </span>
        `;
    }
}

function initializeEventListeners() {
    // Predict button click
    predictBtn.addEventListener('click', handlePredict);
    
    // Enter key press
    tickerInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handlePredict();
        }
    });
    
    // Theme toggle
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
}

async function handlePredict() {
    const ticker = tickerInput.value.trim().toUpperCase();
    
    if (!ticker) {
        showError('Please enter a stock ticker symbol');
        return;
    }
    
    showLoading();
    
    try {
        const response = await fetch('/predict', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ticker })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to fetch prediction');
        }
        
        hideLoading();
        displayResults(data);
        
    } catch (error) {
        hideLoading();
        showError(error.message);
    }
}

function showLoading() {
    resultsSection.classList.add('hidden');
    errorState.classList.add('hidden');
    loadingState.classList.remove('hidden');
}

function hideLoading() {
    loadingState.classList.add('hidden');
}

function showError(message) {
    loadingState.classList.add('hidden');
    resultsSection.classList.add('hidden');
    errorMessage.textContent = message;
    errorState.classList.remove('hidden');
}

function hideError() {
    errorState.classList.add('hidden');
}

function displayResults(data) {
    resultsSection.classList.remove('hidden');
    
    // Stock Header
    document.getElementById('companyName').textContent = data.company_name;
    document.getElementById('tickerBadge').textContent = data.ticker;
    document.getElementById('marketCap').textContent = formatMarketCap(data.market_cap);
    document.getElementById('peRatio').textContent = formatNumber(data.pe_ratio);
    
    // Price Cards
    document.getElementById('currentPrice').textContent = formatCurrency(data.current_price);
    document.getElementById('predictedPrice').textContent = formatCurrency(data.predicted_price);
    
    // Change Card
    const changeCard = document.getElementById('changeCard');
    const priceChange = document.getElementById('priceChange');
    const percentChange = document.getElementById('percentChange');
    
    const isPositive = data.price_change >= 0;
    priceChange.textContent = (isPositive ? '+' : '') + formatCurrency(data.price_change);
    percentChange.textContent = `(${isPositive ? '+' : ''}${data.percent_change.toFixed(2)}%)`;
    
    changeCard.classList.remove('positive', 'negative');
    changeCard.classList.add(isPositive ? 'positive' : 'negative');
    
    // Recommendation
    const recommendation = document.getElementById('recommendation');
    recommendation.textContent = data.recommendation;
    recommendation.className = 'recommendation-badge ' + data.recommendation.toLowerCase();
    
    // Technical Indicators
    document.getElementById('ma20').textContent = formatCurrency(data.ma20);
    document.getElementById('ma50').textContent = formatCurrency(data.ma50);
    document.getElementById('ma100').textContent = formatCurrency(data.ma100);
    document.getElementById('rsi').textContent = data.rsi.toFixed(2);
    
    // RSI visualization
    const rsiIndicator = document.getElementById('rsiIndicator');
    rsiIndicator.style.left = `${data.rsi}%`;
    
    const rsiBadge = document.getElementById('rsiBadge');
    rsiBadge.classList.remove('oversold', 'overbought', 'neutral');
    if (data.rsi < 30) {
        rsiBadge.textContent = 'Oversold';
        rsiBadge.classList.add('oversold');
    } else if (data.rsi > 70) {
        rsiBadge.textContent = 'Overbought';
        rsiBadge.classList.add('overbought');
    } else {
        rsiBadge.textContent = 'Neutral';
        rsiBadge.classList.add('neutral');
    }
    
    // Moving average bars
    const maxPrice = Math.max(data.ma20, data.ma50, data.ma100, data.current_price);
    document.querySelector('.ma20-fill').style.width = `${(data.ma20 / maxPrice) * 100}%`;
    document.querySelector('.ma50-fill').style.width = `${(data.ma50 / maxPrice) * 100}%`;
    document.querySelector('.ma100-fill').style.width = `${(data.ma100 / maxPrice) * 100}%`;
    
    // 52-Week Range
    const low52 = data.fifty_two_week_low;
    const high52 = data.fifty_two_week_high;
    document.getElementById('fiftyTwoWeekLow').textContent = formatCurrency(low52);
    document.getElementById('fiftyTwoWeekHigh').textContent = formatCurrency(high52);
    
    if (low52 !== 'N/A' && high52 !== 'N/A') {
        const rangePercent = ((data.current_price - low52) / (high52 - low52)) * 100;
        document.getElementById('rangeFill').style.width = `${rangePercent}%`;
        document.getElementById('currentMarker').style.left = `${rangePercent}%`;
    }
    
    // Create Chart
    createPriceChart(data);
    
    // Create Actual vs Predicted Chart
    createComparisonChart(data);
    
    // Scroll to results
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function createPriceChart(data) {
    const ctx = document.getElementById('priceChart').getContext('2d');
    
    // Destroy existing chart
    if (priceChart) {
        priceChart.destroy();
    }
    
    // Prepare data
    const labels = [...data.chart_dates, 'Predicted'];
    const prices = [...data.chart_prices, data.predicted_price];
    
    // Create gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 350);
    gradient.addColorStop(0, 'rgba(99, 102, 241, 0.3)');
    gradient.addColorStop(1, 'rgba(99, 102, 241, 0)');
    
    priceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Stock Price',
                data: prices,
                borderColor: '#6366f1',
                backgroundColor: gradient,
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: '#6366f1',
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 2,
                segment: {
                    borderColor: ctx => {
                        const idx = ctx.p1DataIndex;
                        return idx === prices.length - 1 ? '#10b981' : '#6366f1';
                    },
                    borderDash: ctx => {
                        const idx = ctx.p1DataIndex;
                        return idx === prices.length - 1 ? [5, 5] : undefined;
                    }
                }
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 17, 23, 0.95)',
                    titleColor: '#f8fafc',
                    bodyColor: '#94a3b8',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    cornerRadius: 8,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        title: function(context) {
                            return context[0].label;
                        },
                        label: function(context) {
                            const isPredicted = context.dataIndex === prices.length - 1;
                            const prefix = isPredicted ? 'Predicted: ' : 'Price: ';
                            return prefix + formatCurrency(context.raw);
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#64748b',
                        maxRotation: 45,
                        maxTicksLimit: 10,
                        font: {
                            size: 11
                        }
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#64748b',
                        callback: function(value) {
                            return '$' + value.toFixed(0);
                        },
                        font: {
                            size: 11
                        }
                    }
                }
            }
        }
    });
}

function createComparisonChart(data) {
    const ctx = document.getElementById('comparisonChart').getContext('2d');
    
    // Destroy existing chart
    if (comparisonChart) {
        comparisonChart.destroy();
    }
    
    comparisonChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.comparison_labels,
            datasets: [
                {
                    label: 'Actual Price',
                    data: data.actual_prices,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2.5,
                    fill: false,
                    tension: 0.3,
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    pointHoverBackgroundColor: '#3b82f6',
                    pointHoverBorderColor: '#fff',
                    pointHoverBorderWidth: 2
                },
                {
                    label: 'Predicted Price',
                    data: data.predicted_prices,
                    borderColor: '#22c55e',
                    backgroundColor: 'rgba(34, 197, 94, 0.1)',
                    borderWidth: 2.5,
                    fill: false,
                    tension: 0.3,
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    pointHoverBackgroundColor: '#22c55e',
                    pointHoverBorderColor: '#fff',
                    pointHoverBorderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 17, 23, 0.95)',
                    titleColor: '#f8fafc',
                    bodyColor: '#94a3b8',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    cornerRadius: 8,
                    padding: 12,
                    callbacks: {
                        title: function(context) {
                            return 'Day ' + context[0].label;
                        },
                        label: function(context) {
                            const label = context.dataset.label;
                            return label + ': ' + formatCurrency(context.raw);
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Time (Days)',
                        color: '#64748b',
                        font: {
                            size: 12,
                            weight: 500
                        }
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#64748b',
                        maxTicksLimit: 15,
                        font: {
                            size: 11
                        }
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Price (USD)',
                        color: '#64748b',
                        font: {
                            size: 12,
                            weight: 500
                        }
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#64748b',
                        callback: function(value) {
                            return '$' + value.toFixed(0);
                        },
                        font: {
                            size: 11
                        }
                    }
                }
            }
        }
    });
}

// Utility Functions
function formatCurrency(value) {
    if (value === 'N/A' || value === null || value === undefined) {
        return 'N/A';
    }
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value);
}

function formatMarketCap(value) {
    if (value === 'N/A' || value === null || value === undefined) {
        return 'N/A';
    }
    
    if (value >= 1e12) {
        return '$' + (value / 1e12).toFixed(2) + 'T';
    } else if (value >= 1e9) {
        return '$' + (value / 1e9).toFixed(2) + 'B';
    } else if (value >= 1e6) {
        return '$' + (value / 1e6).toFixed(2) + 'M';
    } else {
        return '$' + value.toLocaleString();
    }
}

function formatNumber(value) {
    if (value === 'N/A' || value === null || value === undefined) {
        return 'N/A';
    }
    return value.toFixed(2);
}

function toggleTheme() {
    const html = document.documentElement;
    const icon = document.querySelector('#themeToggle i');
    
    if (html.getAttribute('data-theme') === 'light') {
        html.removeAttribute('data-theme');
        icon.classList.remove('fa-sun');
        icon.classList.add('fa-moon');
        localStorage.setItem('theme', 'dark');
        
        // Update charts for dark theme
        updateChartsTheme('dark');
    } else {
        html.setAttribute('data-theme', 'light');
        icon.classList.remove('fa-moon');
        icon.classList.add('fa-sun');
        localStorage.setItem('theme', 'light');
        
        // Update charts for light theme
        updateChartsTheme('light');
    }
}

function updateChartsTheme(theme) {
    const gridColor = theme === 'light' ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.05)';
    const textColor = theme === 'light' ? '#475569' : '#64748b';
    
    if (priceChart) {
        priceChart.options.scales.x.grid.color = gridColor;
        priceChart.options.scales.y.grid.color = gridColor;
        priceChart.options.scales.x.ticks.color = textColor;
        priceChart.options.scales.y.ticks.color = textColor;
        priceChart.update();
    }
    
    if (comparisonChart) {
        comparisonChart.options.scales.x.grid.color = gridColor;
        comparisonChart.options.scales.y.grid.color = gridColor;
        comparisonChart.options.scales.x.ticks.color = textColor;
        comparisonChart.options.scales.y.ticks.color = textColor;
        comparisonChart.options.scales.x.title.color = textColor;
        comparisonChart.options.scales.y.title.color = textColor;
        comparisonChart.update();
    }
}

function loadSavedTheme() {
    const savedTheme = localStorage.getItem('theme');
    const icon = document.querySelector('#themeToggle i');
    
    if (savedTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        icon.classList.remove('fa-moon');
        icon.classList.add('fa-sun');
    }
}
