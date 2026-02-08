/* ========================================
   Market Condition Classifier - Logic
   Real Market Data Integration
   ======================================== */

// ========================================
// API Configuration
// ========================================

const API_CONFIG = {
    // Twelve Data - Free tier: 800 API credits/day, 8 requests/min
    // Get your free API key at: https://twelvedata.com/
    twelveData: {
        baseUrl: 'https://api.twelvedata.com',
        apiKey: 'd9db9e7974914d1b99d4ebfe8d7194f3'
    },

    // Finnhub - Free tier: 60 API calls/minute
    // Get your free API key at: https://finnhub.io/
    finnhub: {
        baseUrl: 'https://finnhub.io/api/v1',
        apiKey: '' // Add your Finnhub API key here
    }
};

// ========================================
// Instrument Configuration (Expanded)
// ========================================

const INSTRUMENTS = {
    // Major Forex Pairs
    'EURUSD': { name: 'EUR/USD', category: 'forex', twelveSymbol: 'EUR/USD', baseATR: 0.0008 },
    'GBPUSD': { name: 'GBP/USD', category: 'forex', twelveSymbol: 'GBP/USD', baseATR: 0.0012 },
    'USDJPY': { name: 'USD/JPY', category: 'forex', twelveSymbol: 'USD/JPY', baseATR: 0.50 },
    'AUDUSD': { name: 'AUD/USD', category: 'forex', twelveSymbol: 'AUD/USD', baseATR: 0.0007 },
    'USDCAD': { name: 'USD/CAD', category: 'forex', twelveSymbol: 'USD/CAD', baseATR: 0.0008 },
    'USDCHF': { name: 'USD/CHF', category: 'forex', twelveSymbol: 'USD/CHF', baseATR: 0.0006 },
    'NZDUSD': { name: 'NZD/USD', category: 'forex', twelveSymbol: 'NZD/USD', baseATR: 0.0007 },

    // Cross Pairs
    'EURGBP': { name: 'EUR/GBP', category: 'forex', twelveSymbol: 'EUR/GBP', baseATR: 0.0006 },
    'EURJPY': { name: 'EUR/JPY', category: 'forex', twelveSymbol: 'EUR/JPY', baseATR: 0.60 },
    'GBPJPY': { name: 'GBP/JPY', category: 'forex', twelveSymbol: 'GBP/JPY', baseATR: 0.80 },

    // Commodities
    'XAUUSD': { name: 'XAU/USD', category: 'commodity', twelveSymbol: 'XAU/USD', baseATR: 18.5 },
    'XAGUSD': { name: 'XAG/USD', category: 'commodity', twelveSymbol: 'XAG/USD', baseATR: 0.35 },
    'BRENT': { name: 'Brent Oil', category: 'commodity', twelveSymbol: 'BZ', baseATR: 1.2 },

    // Crypto (if interested)
    'BTCUSD': { name: 'BTC/USD', category: 'crypto', twelveSymbol: 'BTC/USD', baseATR: 800 },
    'ETHUSD': { name: 'ETH/USD', category: 'crypto', twelveSymbol: 'ETH/USD', baseATR: 50 },

    // Indices
    'SPX': { name: 'S&P 500', category: 'index', twelveSymbol: 'SPX', baseATR: 25 },
    'NDX': { name: 'NASDAQ', category: 'index', twelveSymbol: 'NDX', baseATR: 120 }
};

// ========================================
// Configuration
// ========================================

const CONFIG = {
    // Refresh every 4 minutes (240 seconds) to stay under 800 API credits/day
    // Math: 800 credits / 2 credits per refresh = 400 refreshes
    // 24 hours * 60 min = 1440 min / 400 = 3.6 min, so 4 min is safe
    refreshInterval: 240000, // 4 minutes (240 seconds)

    // Volatility thresholds (ATR percentile vs 20-day average)
    volatility: {
        low: 40,      // Below 40% = Low volatility
        high: 75      // Above 75% = High volatility
    },

    // Trend strength thresholds (ADX)
    trend: {
        ranging: 20,  // Below 20 = Ranging
        strong: 40    // Above 40 = Strong trend
    },

    // News timing (minutes)
    news: {
        safe: 120,    // More than 2 hours = Safe
        caution: 30   // Less than 30 min = Danger
    },

    // Trading sessions (UTC hours)
    sessions: {
        sydney: { start: 21, end: 6, name: 'Sydney' },
        tokyo: { start: 0, end: 9, name: 'Tokyo' },
        london: { start: 7, end: 16, name: 'London' },
        newyork: { start: 12, end: 21, name: 'New York' }
    }
};

// ========================================
// State
// ========================================

let state = {
    selectedInstrument: 'EURUSD',
    selectedCategory: 'all',
    refreshCountdown: 240,
    useRealData: true, // Set to false to use mock data
    apiStatus: {
        twelveData: 'unknown',
        finnhub: 'unknown'
    },
    cache: {
        technicalData: {},
        newsData: null,
        lastFetch: {}
    }
};

// ========================================
// API Functions - Twelve Data
// ========================================

async function fetchTechnicalIndicators(symbol) {
    const instrument = INSTRUMENTS[symbol];
    if (!instrument) return null;

    const twelveSymbol = instrument.twelveSymbol;
    const cacheKey = `${symbol}_technical`;
    const now = Date.now();

    // Use cache if less than 60 seconds old
    if (state.cache.technicalData[cacheKey] &&
        (now - state.cache.lastFetch[cacheKey]) < 60000) {
        console.log(`[Cache] Using cached data for ${symbol}`);
        return state.cache.technicalData[cacheKey];
    }

    try {
        // Fetch ATR and ADX in parallel
        const [atrResponse, adxResponse] = await Promise.all([
            fetch(`${API_CONFIG.twelveData.baseUrl}/atr?symbol=${twelveSymbol}&interval=1h&apikey=${API_CONFIG.twelveData.apiKey}`),
            fetch(`${API_CONFIG.twelveData.baseUrl}/adx?symbol=${twelveSymbol}&interval=1h&apikey=${API_CONFIG.twelveData.apiKey}`)
        ]);

        const atrData = await atrResponse.json();
        const adxData = await adxResponse.json();

        // Check for API errors
        if (atrData.status === 'error' || adxData.status === 'error') {
            console.warn('[API] Error from Twelve Data:', atrData.message || adxData.message);
            state.apiStatus.twelveData = 'error';
            return null;
        }

        state.apiStatus.twelveData = 'ok';

        // Parse the data
        const atrValues = atrData.values || [];
        const adxValues = adxData.values || [];

        if (atrValues.length === 0 || adxValues.length === 0) {
            console.warn('[API] No data returned for', symbol);
            return null;
        }

        // Get current and historical ATR for comparison
        const currentATR = parseFloat(atrValues[0]?.atr || 0);
        const historicalATRs = atrValues.slice(0, 20).map(v => parseFloat(v.atr));
        const avgATR = historicalATRs.reduce((a, b) => a + b, 0) / historicalATRs.length;

        // Calculate percentile (current vs average)
        const atrPercentile = avgATR > 0 ? Math.round((currentATR / avgATR) * 50) : 50;

        // Get ADX and direction
        const currentADX = parseFloat(adxValues[0]?.adx || 0);
        const plusDI = parseFloat(adxValues[0]?.plus_di || 0);
        const minusDI = parseFloat(adxValues[0]?.minus_di || 0);

        let direction = 'NEUTRAL →';
        if (plusDI > minusDI && currentADX > 20) {
            direction = 'BULLISH ↑';
        } else if (minusDI > plusDI && currentADX > 20) {
            direction = 'BEARISH ↓';
        }

        const result = {
            volatility: {
                atr: currentATR,
                avgATR: avgATR,
                percentile: Math.min(100, Math.max(0, atrPercentile))
            },
            trend: {
                adx: Math.min(60, Math.max(0, currentADX)),
                direction: direction
            }
        };

        // Cache the result
        state.cache.technicalData[cacheKey] = result;
        state.cache.lastFetch[cacheKey] = now;

        console.log(`[API] Successfully fetched data for ${symbol}:`, result);
        return result;

    } catch (error) {
        console.error('[API] Failed to fetch from Twelve Data:', error);
        state.apiStatus.twelveData = 'error';
        return null;
    }
}

// ========================================
// API Functions - Finnhub Economic Calendar
// ========================================

async function fetchEconomicCalendar() {
    // Use cache if less than 5 minutes old
    const now = Date.now();
    if (state.cache.newsData && (now - state.cache.lastFetch.news) < 300000) {
        return state.cache.newsData;
    }

    if (!API_CONFIG.finnhub.apiKey) {
        // Use alternative free source or mock data
        return generateMockNewsEvents();
    }

    try {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const from = today.toISOString().split('T')[0];
        const to = tomorrow.toISOString().split('T')[0];

        const response = await fetch(
            `${API_CONFIG.finnhub.baseUrl}/calendar/economic?from=${from}&to=${to}&token=${API_CONFIG.finnhub.apiKey}`
        );

        const data = await response.json();

        if (!data.economicCalendar) {
            state.apiStatus.finnhub = 'error';
            return generateMockNewsEvents();
        }

        state.apiStatus.finnhub = 'ok';

        // Filter for high-impact events and upcoming ones
        const events = data.economicCalendar
            .filter(e => e.impact >= 2) // Medium to high impact
            .map(e => {
                const eventTime = new Date(`${e.time}`);
                const minutesUntil = Math.round((eventTime - now) / 60000);

                return {
                    title: e.event,
                    impact: e.impact === 3 ? 'high' : e.impact === 2 ? 'medium' : 'low',
                    currency: e.country,
                    time: eventTime,
                    minutesUntil: minutesUntil
                };
            })
            .filter(e => e.minutesUntil > -30 && e.minutesUntil < 480) // -30 min to 8 hours
            .sort((a, b) => a.minutesUntil - b.minutesUntil)
            .slice(0, 5);

        state.cache.newsData = events;
        state.cache.lastFetch.news = now;

        return events;

    } catch (error) {
        console.error('[API] Failed to fetch economic calendar:', error);
        state.apiStatus.finnhub = 'error';
        return generateMockNewsEvents();
    }
}

// ========================================
// Mock Data Generator (Fallback)
// ========================================

function generateMockData(instrument) {
    const hour = new Date().getHours();
    const isActiveSession = hour >= 8 && hour <= 22;

    const instrumentConfig = INSTRUMENTS[instrument] || { baseATR: 0.001 };
    const baseATR = instrumentConfig.baseATR;

    const volatilityMultiplier = isActiveSession ? (0.8 + Math.random() * 0.6) : (0.4 + Math.random() * 0.4);
    const currentATR = baseATR * volatilityMultiplier;
    const avgATR = baseATR;
    const atrPercentile = Math.round((currentATR / avgATR) * 50 + Math.random() * 30);

    const adxBase = isActiveSession ? 25 : 18;
    const adx = Math.round(adxBase + (Math.random() * 25 - 10));
    const directions = ['BULLISH ↑', 'BEARISH ↓', 'NEUTRAL →'];
    const direction = directions[Math.floor(Math.random() * 3)];

    return {
        volatility: {
            atr: currentATR,
            avgATR: avgATR,
            percentile: Math.min(100, Math.max(0, atrPercentile))
        },
        trend: {
            adx: Math.min(60, Math.max(5, adx)),
            direction: direction
        }
    };
}

function generateMockNewsEvents() {
    const now = new Date();
    const events = [
        { title: 'US CPI Data', impact: 'high', currency: 'USD' },
        { title: 'ECB Interest Rate', impact: 'high', currency: 'EUR' },
        { title: 'UK GDP', impact: 'high', currency: 'GBP' },
        { title: 'US Jobless Claims', impact: 'medium', currency: 'USD' },
        { title: 'German ZEW', impact: 'medium', currency: 'EUR' },
        { title: 'Australia Employment', impact: 'medium', currency: 'AUD' },
        { title: 'Canada CPI', impact: 'high', currency: 'CAD' },
        { title: 'Japan Trade Balance', impact: 'low', currency: 'JPY' }
    ];

    const upcomingEvents = [];
    const usedIndexes = new Set();

    for (let i = 0; i < 4; i++) {
        let idx;
        do {
            idx = Math.floor(Math.random() * events.length);
        } while (usedIndexes.has(idx));
        usedIndexes.add(idx);

        const event = { ...events[idx] };
        const minutesAhead = Math.floor(Math.random() * 300) + 15;
        event.time = new Date(now.getTime() + minutesAhead * 60000);
        event.minutesUntil = minutesAhead;
        upcomingEvents.push(event);
    }

    return upcomingEvents.sort((a, b) => a.time - b.time);
}

// ========================================
// Analysis Functions
// ========================================

function analyzeVolatility(data) {
    const percentile = data.volatility.percentile;

    let level, signal, advice;

    if (percentile <= CONFIG.volatility.low) {
        level = 'green';
        signal = '🟢';
        advice = '✅ Low volatility. Good conditions for EA trading.';
    } else if (percentile >= CONFIG.volatility.high) {
        level = 'red';
        signal = '🔴';
        advice = '⛔ High volatility! Consider turning EA OFF.';
    } else {
        level = 'yellow';
        signal = '🟡';
        advice = '⚠️ Moderate volatility. Proceed with caution.';
    }

    return { level, signal, advice, percentile, atr: data.volatility.atr };
}

function analyzeTrend(data) {
    const adx = data.trend.adx;
    const direction = data.trend.direction;

    let level, signal, advice;

    if (adx >= CONFIG.trend.strong) {
        level = 'green';
        signal = '🟢';
        advice = `✅ Strong ${direction} trend. Great for trend-following EAs.`;
    } else if (adx <= CONFIG.trend.ranging) {
        level = 'yellow';
        signal = '🟡';
        advice = '⚠️ Ranging market. May be choppy for trend EAs.';
    } else {
        level = 'yellow';
        signal = '🟡';
        advice = '⚠️ Moderate trend strength. Watch for direction changes.';
    }

    return { level, signal, advice, adx, direction };
}

function analyzeNews(events) {
    if (!events || events.length === 0) {
        return {
            level: 'green',
            signal: '🟢',
            advice: '✅ No major news events scheduled.',
            events: [],
            nextEvent: null
        };
    }

    const nextEvent = events[0];
    const minutesUntil = nextEvent.minutesUntil;

    let level, signal, advice;

    if (nextEvent.impact === 'high' && minutesUntil <= CONFIG.news.caution) {
        level = 'red';
        signal = '🔴';
        advice = `⛔ High-impact news in ${minutesUntil} min! Turn EA OFF!`;
    } else if (nextEvent.impact === 'high' && minutesUntil <= CONFIG.news.safe) {
        level = 'yellow';
        signal = '🟡';
        advice = `⚠️ High-impact news approaching. Consider pausing EA.`;
    } else if (minutesUntil <= CONFIG.news.caution) {
        level = 'yellow';
        signal = '🟡';
        advice = `⚠️ News event in ${minutesUntil} min. Stay alert.`;
    } else {
        level = 'green';
        signal = '🟢';
        advice = '✅ No imminent news. Safe to trade.';
    }

    return { level, signal, advice, events, nextEvent };
}

function calculateMasterSignal(volatility, trend, news) {
    const signals = [volatility.level, trend.level, news.level];

    if (signals.includes('red')) {
        return {
            level: 'red',
            icon: '🛑',
            title: 'HIGH RISK DETECTED',
            desc: 'One or more indicators show dangerous conditions',
            recommendation: 'EA OFF'
        };
    } else if (signals.includes('yellow')) {
        return {
            level: 'yellow',
            icon: '⚠️',
            title: 'CAUTION ADVISED',
            desc: 'Some conditions are not optimal',
            recommendation: 'CAUTION'
        };
    } else {
        return {
            level: 'green',
            icon: '✅',
            title: 'CONDITIONS FAVORABLE',
            desc: 'All indicators show safe trading conditions',
            recommendation: 'EA ON'
        };
    }
}

// ========================================
// Session Detection
// ========================================

function getActiveSessions() {
    const now = new Date();
    const utcHour = now.getUTCHours();

    const active = {};

    for (const [session, hours] of Object.entries(CONFIG.sessions)) {
        if (hours.start < hours.end) {
            active[session] = utcHour >= hours.start && utcHour < hours.end;
        } else {
            active[session] = utcHour >= hours.start || utcHour < hours.end;
        }
    }

    return active;
}

function getCurrentSessionName() {
    const sessions = getActiveSessions();
    const activeNames = Object.entries(sessions)
        .filter(([_, active]) => active)
        .map(([name, _]) => CONFIG.sessions[name]?.name || name);

    if (activeNames.length === 0) return 'OFF-MARKET';
    if (activeNames.length === 1) return activeNames[0];
    return activeNames.join(' / ');
}

// ========================================
// UI Update Functions
// ========================================

function updateUI(volatility, trend, news, master) {
    // Master signal
    const masterEl = document.getElementById('master-signal');
    masterEl.className = `master-signal signal-${master.level}`;
    document.getElementById('master-icon').textContent = master.icon;
    document.getElementById('master-title').textContent = master.title;
    document.getElementById('master-desc').textContent = master.desc;
    document.getElementById('master-recommendation').textContent = master.recommendation;

    // Volatility panel
    const volPanel = document.getElementById('volatility-panel');
    volPanel.className = `indicator-panel panel-${volatility.level}`;
    document.getElementById('volatility-light').textContent = volatility.signal;
    document.getElementById('atr-value').textContent = formatATR(volatility.atr);
    document.getElementById('atr-percent').textContent = `${volatility.percentile}%`;
    document.getElementById('volatility-fill').style.setProperty('--fill-percent', `${volatility.percentile}%`);
    document.getElementById('volatility-advice').textContent = volatility.advice;

    // Trend panel
    const trendPanel = document.getElementById('trend-panel');
    trendPanel.className = `indicator-panel panel-${trend.level}`;
    document.getElementById('trend-light').textContent = trend.signal;
    document.getElementById('adx-value').textContent = trend.adx.toFixed(1);
    document.getElementById('trend-direction').textContent = trend.direction;
    document.getElementById('trend-indicator').style.setProperty('--gauge-position', `${(trend.adx / 60) * 100}%`);
    document.getElementById('trend-advice').textContent = trend.advice;

    // News panel
    const newsPanel = document.getElementById('news-panel');
    newsPanel.className = `indicator-panel panel-${news.level}`;
    document.getElementById('news-light').textContent = news.signal;
    document.getElementById('news-advice').textContent = news.advice;

    if (news.nextEvent) {
        document.getElementById('next-event').textContent = news.nextEvent.title;
        document.getElementById('event-countdown').textContent = formatCountdown(news.nextEvent.minutesUntil);
    } else {
        document.getElementById('next-event').textContent = 'None';
        document.getElementById('event-countdown').textContent = '--';
    }

    updateNewsList(news.events);
    updateSessions();
    updateApiStatus();

    document.getElementById('last-update').textContent = new Date().toLocaleTimeString();
}

function updateNewsList(events) {
    const container = document.getElementById('news-list');
    container.innerHTML = '';

    if (!events || events.length === 0) {
        container.innerHTML = '<div class="news-item">No upcoming events</div>';
        return;
    }

    events.slice(0, 4).forEach(event => {
        const div = document.createElement('div');
        div.className = 'news-item fade-in';
        div.innerHTML = `
            <span class="impact-${event.impact}">${event.impact.toUpperCase()}</span>
            <span class="news-time">${formatCountdown(event.minutesUntil)}</span>
            <span class="news-title">${event.title} (${event.currency})</span>
        `;
        container.appendChild(div);
    });
}

function updateSessions() {
    const sessions = getActiveSessions();

    for (const [session, active] of Object.entries(sessions)) {
        const card = document.getElementById(`session-${session}`);
        if (card) {
            card.className = `session-card ${active ? 'active' : ''}`;
            card.querySelector('.session-status').textContent = active ? 'OPEN' : 'CLOSED';
        }
    }

    const badge = document.getElementById('session-badge');
    const currentSession = getCurrentSessionName();
    badge.textContent = currentSession;
    badge.className = `session-badge ${currentSession !== 'OFF-MARKET' ? 'active' : ''}`;
}

function updateApiStatus() {
    const statusEl = document.getElementById('api-status');
    if (!statusEl) return;

    let statusText = '';
    let statusClass = '';

    if (state.apiStatus.twelveData === 'ok') {
        statusText = '🟢 Live Data';
        statusClass = 'status-live';
    } else if (state.apiStatus.twelveData === 'error') {
        statusText = '🟡 Demo Mode';
        statusClass = 'status-demo';
    } else {
        statusText = '⏳ Connecting...';
        statusClass = 'status-loading';
    }

    statusEl.textContent = statusText;
    statusEl.className = `api-status ${statusClass}`;
}

function updateInstrumentButtons() {
    const container = document.getElementById('instrument-buttons');
    container.innerHTML = '';

    const category = state.selectedCategory;

    Object.entries(INSTRUMENTS).forEach(([symbol, config]) => {
        if (category !== 'all' && config.category !== category) return;

        const btn = document.createElement('button');
        btn.className = `instrument-btn ${symbol === state.selectedInstrument ? 'active' : ''}`;
        btn.dataset.symbol = symbol;
        btn.textContent = config.name;
        container.appendChild(btn);
    });
}

function formatATR(value) {
    if (value === undefined || value === null) return '--';
    if (value >= 100) {
        return value.toFixed(0);
    } else if (value >= 1) {
        return value.toFixed(2);
    } else {
        return value.toFixed(5);
    }
}

function formatCountdown(minutes) {
    if (minutes < 0) return 'NOW';
    if (minutes < 60) {
        return `${Math.round(minutes)}m`;
    } else {
        const hours = Math.floor(minutes / 60);
        const mins = Math.round(minutes % 60);
        return `${hours}h ${mins}m`;
    }
}

// ========================================
// Time Display
// ========================================

function updateTimeDisplay() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    document.getElementById('current-time').textContent = timeStr;
}

// ========================================
// Refresh Logic
// ========================================

async function refreshData() {
    console.log(`[${new Date().toLocaleTimeString()}] Refreshing data for ${state.selectedInstrument}...`);

    // Show loading state
    document.getElementById('master-title').textContent = 'Analyzing...';

    try {
        // Fetch real data if enabled
        let technicalData;
        let newsEvents;

        if (state.useRealData) {
            [technicalData, newsEvents] = await Promise.all([
                fetchTechnicalIndicators(state.selectedInstrument),
                fetchEconomicCalendar()
            ]);
        }

        // Fall back to mock data if API fails
        if (!technicalData) {
            console.log('[Fallback] Using mock data');
            technicalData = generateMockData(state.selectedInstrument);
        }

        if (!newsEvents) {
            newsEvents = generateMockNewsEvents();
        }

        // Analyze
        const volatility = analyzeVolatility(technicalData);
        const trend = analyzeTrend(technicalData);
        const news = analyzeNews(newsEvents);
        const master = calculateMasterSignal(volatility, trend, news);

        // Update UI
        updateUI(volatility, trend, news, master);

    } catch (error) {
        console.error('[Refresh] Error:', error);
        // Use mock data on error
        const technicalData = generateMockData(state.selectedInstrument);
        const newsEvents = generateMockNewsEvents();

        const volatility = analyzeVolatility(technicalData);
        const trend = analyzeTrend(technicalData);
        const news = analyzeNews(newsEvents);
        const master = calculateMasterSignal(volatility, trend, news);

        updateUI(volatility, trend, news, master);
    }

    // Reset countdown
    state.refreshCountdown = 240;
}

function startRefreshCountdown() {
    setInterval(() => {
        state.refreshCountdown--;
        const countdownEl = document.getElementById('refresh-countdown');
        if (countdownEl) {
            countdownEl.textContent = `${state.refreshCountdown}s`;
        }

        if (state.refreshCountdown <= 0) {
            refreshData();
        }
    }, 1000);
}

// ========================================
// Event Listeners
// ========================================

function setupEventListeners() {
    // Instrument selector
    document.getElementById('instrument-buttons').addEventListener('click', (e) => {
        if (e.target.classList.contains('instrument-btn')) {
            document.querySelectorAll('.instrument-btn').forEach(btn =>
                btn.classList.remove('active')
            );
            e.target.classList.add('active');

            state.selectedInstrument = e.target.dataset.symbol;
            refreshData();
        }
    });

    // Category filter
    const categoryFilter = document.getElementById('category-filter');
    if (categoryFilter) {
        categoryFilter.addEventListener('click', (e) => {
            if (e.target.classList.contains('category-btn')) {
                document.querySelectorAll('.category-btn').forEach(btn =>
                    btn.classList.remove('active')
                );
                e.target.classList.add('active');

                state.selectedCategory = e.target.dataset.category;
                updateInstrumentButtons();

                // Select first instrument in category
                const firstSymbol = Object.entries(INSTRUMENTS)
                    .find(([_, config]) =>
                        state.selectedCategory === 'all' || config.category === state.selectedCategory
                    )?.[0];

                if (firstSymbol) {
                    state.selectedInstrument = firstSymbol;
                    refreshData();
                }
            }
        });
    }

    // Refresh button
    document.getElementById('refresh-btn').addEventListener('click', () => {
        refreshData();
    });

    // Toggle data source
    const toggleBtn = document.getElementById('toggle-data-source');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            state.useRealData = !state.useRealData;
            toggleBtn.textContent = state.useRealData ? '📡 Live' : '🎭 Demo';
            refreshData();
        });
    }
}

// ========================================
// Initialization
// ========================================

function init() {
    console.log('Market Condition Classifier v2.0 initialized');
    console.log(`Instruments available: ${Object.keys(INSTRUMENTS).length}`);

    // Setup event listeners
    setupEventListeners();

    // Initial UI setup
    updateInstrumentButtons();

    // Start time display
    updateTimeDisplay();
    setInterval(updateTimeDisplay, 1000);

    // Initial data fetch
    refreshData();

    // Start auto-refresh countdown
    startRefreshCountdown();
}

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', init);
