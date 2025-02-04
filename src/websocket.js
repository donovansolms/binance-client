import zip from 'lodash.zipobject'

import httpMethods from 'http-client'
import openWebSocket from 'open-websocket'

const BASE = 'wss://stream.binance.com:9443/ws'
const COMBINED_BASE = 'wss://stream.binance.com:9443/stream'
const COMBINED_BASE_US = 'wss://stream.binance.us:9443/stream'

const depth = (payload, cb) => {
  const cache = (Array.isArray(payload) ? payload : [payload]).map(symbol => {
    const w = openWebSocket(`${BASE}/${symbol.toLowerCase()}@depth`)
    w.onmessage = msg => {
      const {
        e: eventType,
        E: eventTime,
        s: symbol,
        U: firstUpdateId,
        u: finalUpdateId,
        b: bidDepth,
        a: askDepth,
      } = JSON.parse(msg.data)

      cb({
        eventType,
        eventTime,
        symbol,
        firstUpdateId,
        finalUpdateId,
        bidDepth: bidDepth.map(b => zip(['price', 'qty'], b)),
        askDepth: askDepth.map(a => zip(['price', 'qty'], a)),
      })
    }

    return w
  })

  return {
    closeStream: options => 
    cache.forEach(w => w.close(1000, 'Close handle was called', { keepClosed: true, ...options })),
    ws: cache
  }
}

const partialDepth = (payload, cb) => {
  const cache = (Array.isArray(payload) ? payload : [payload]).map(({ symbol, level }) => {
    const w = openWebSocket(`${BASE}/${symbol.toLowerCase()}@depth${level}`)
    w.onmessage = msg => {
      const { lastUpdateId, bids, asks } = JSON.parse(msg.data)
      cb({
        symbol,
        level,
        lastUpdateId,
        bids: bids.map(b => zip(['price', 'qty'], b)),
        asks: asks.map(a => zip(['price', 'qty'], a)),
      })
    }

    return w
  })

  return {
    closeStream: options =>
    cache.forEach(w => w.close(1000, 'Close handle was called', { keepClosed: true, ...options })),
    ws: cache
  }
}

const candles = (payload, interval, useUS, cb) => {
  if (!interval || !cb) {
    throw new Error('Please pass a symbol, interval and callback.')
  }

  const streams = (Array.isArray(payload) ? payload : [payload]).map(symbol => {
    return `${symbol.toLowerCase()}@kline_${interval}`;
  });
  // TODO: Binance allows up to 1024 streams to be combined, if larger, split
  // into multiple combined streams
  // TODO: Using Binance.us should be in the main config of Binance()
  let streamEndpoints = [COMBINED_BASE + "?streams=" + streams.join("/")];
  if (useUS) {
    streamEndpoints = [COMBINED_BASE_US + "?streams=" + streams.join("/")];
  }
  
  var cache = (streamEndpoints).map(function (streamEndpoint) {
    const w = openWebSocket(streamEndpoint)
    w.onmessage = msg => {
      const { e: eventType, E: eventTime, s: symbol, k: tick } = JSON.parse(msg.data).data
      const {
        t: startTime,
        T: closeTime,
        f: firstTradeId,
        L: lastTradeId,
        o: open,
        h: high,
        l: low,
        c: close,
        v: volume,
        n: trades,
        i: interval,
        x: isFinal,
        q: quoteAssetVolume,
        V: buyAssetVolume,
        Q: quoteBuyAssetVolume
      } = tick

      cb({
        eventType,
        eventTime,
        symbol,
        startTime,
        closeTime,
        firstTradeId,
        lastTradeId,
        open,
        high,
        low,
        close,
        volume,
        trades,
        interval,
        isFinal,
        quoteAssetVolume,
        buyAssetVolume,
        quoteBuyAssetVolume
      })
    }

    return w
  })

  return {
    closeStream: options =>
    cache.forEach(w => w.close(1000, 'Close handle was called', { keepClosed: true, ...options })),
    ws: cache
  }
}

const tickerTransform = m => ({
  eventType: m.e,
  eventTime: m.E,
  symbol: m.s,
  priceChange: m.p,
  priceChangePercent: m.P,
  weightedAvg: m.w,
  prevDayClose: m.x,
  curDayClose: m.c,
  closeTradeQty: m.Q,
  bestBid: m.b,
  bestBidQnt: m.B,
  bestAsk: m.a,
  bestAskQnt: m.A,
  open: m.o,
  high: m.h,
  low: m.l,
  volume: m.v,
  volumeQuote: m.q,
  openTime: m.O,
  closeTime: m.C,
  firstTradeId: m.F,
  lastTradeId: m.L,
  totalTrades: m.n,
})

const ticker = (payload, cb) => {
  const cache = (Array.isArray(payload) ? payload : [payload]).map(symbol => {
    const w = openWebSocket(`${BASE}/${symbol.toLowerCase()}@ticker`)

    w.onmessage = msg => {
      cb(tickerTransform(JSON.parse(msg.data)))
    }

    return w
  })

  return {
    closeStream: options =>
    cache.forEach(w => w.close(1000, 'Close handle was called', { keepClosed: true, ...options })),
    ws: cache
  }
}

const allTickers = cb => {
  const w = new openWebSocket(`${BASE}/!ticker@arr`)

  w.onmessage = msg => {
    const arr = JSON.parse(msg.data)
    cb(arr.map(m => tickerTransform(m)))
  }

  return {
    closeStream: options => w.close(1000, 'Close handle was called', { keepClosed: true, ...options }),
    ws: w
  }
}

const tradesInternal = (payload, streamName, outputMap, cb) => {
  const cache = (Array.isArray(payload) ? payload : [payload]).map(symbol => {
    const w = openWebSocket(`${BASE}/${symbol.toLowerCase()}@${streamName}`)
    w.onmessage = msg => {
      cb(outputMap(JSON.parse(msg.data)))
    }

    return w
  })

  return {
    closeStream: options =>
      cache.forEach(w => w.close(1000, 'Close handle was called', { keepClosed: true, ...options })),
    ws: cache
  }
}

const aggTradesOutputMapping = (d) => ({
  eventType: d.e,
  eventTime: d.E,
  symbol: d.s,
  aggId: d.a,
  price: d.p,
  qty: d.q,
  firstTradeId: d.f,
  lastTradeId: d.l,
  tradeTime: d.T,
  isBuyerMaker: d.m,
  isBestMatch: d.M
})
const aggTrades = (payload, cb) => tradesInternal(payload, 'aggTrade', aggTradesOutputMapping, cb)


const tradesOutputMapping = (d) => ({
  eventType: d.e,
  eventTime: d.E,
  symbol: d.s,
  tradeId: d.t,
  price: d.p,
  qty: d.q,
  buyerOrderId: d.b,
  sellerOrderId: d.a,
  tradeTime: d.T,
  isBuyerMaker: d.m,
  isBestMatch: d.M
})
const trades = (payload, cb) => tradesInternal(payload, 'trade', tradesOutputMapping, cb)

const userTransforms = {
  outboundAccountInfo: m => ({
    eventType: 'account',
    eventTime: m.E,
    makerCommissionRate: m.m,
    takerCommissionRate: m.t,
    buyerCommissionRate: m.b,
    sellerCommissionRate: m.s,
    canTrade: m.T,
    canWithdraw: m.W,
    canDeposit: m.D,
    lastAccountUpdate: m.u,
    balances: m.B.reduce((out, cur) => {
      out[cur.a] = { available: cur.f, locked: cur.l }
      return out
    }, {}),
  }),
  executionReport: m => ({
    eventType: 'executionReport',
    eventTime: m.E,
    symbol: m.s,
    newClientOrderId: m.c,
    originalClientOrderId: m.C,
    side: m.S,
    orderType: m.o,
    timeInForce: m.f,
    qty: m.q,
    price: m.p,
    executionType: m.x,
    stopPrice: m.P,
    icebergQty: m.F,
    orderStatus: m.X,
    orderRejectReason: m.r,
    orderId: m.i,
    orderTime: m.T,
    lastTradeQty: m.l,
    totalTradeQty: m.z,
    priceLastTrade: m.L,
    commission: m.n,
    commissionAsset: m.N,
    tradeId: m.t,
    isOrderWorking: m.w,
    isBuyerMaker: m.m,
    creationTime: m.O,
    totalQuoteTradeQty: m.Z,
  }),
}

export const userEventHandler = cb => msg => {
  const { e: type, ...rest } = JSON.parse(msg.data)
  cb(userTransforms[type] ? userTransforms[type](rest) : { type, ...rest })
}

export const keepStreamAlive = (method, listenKey) => method({ listenKey })

const user = opts => cb => {
  const { getDataStream, keepDataStream, closeDataStream } = httpMethods(opts)
  let currentListenKey = null
  let int = null
  let w = null

  const keepAlive = isReconnecting => {
    if (currentListenKey) {
      keepStreamAlive(keepDataStream, currentListenKey).catch(() => {
        closeStream({}, true)

        if (isReconnecting) {
          setTimeout(() => makeStream(true), 30e3)
        } else {
          makeStream(true)
        }
      })
    }
  }

  const closeStream = (options, catchErrors) => {
    if (currentListenKey) {
      clearInterval(int)

      const p = closeDataStream({ listenKey: currentListenKey })

      if (catchErrors) {
        p.catch(f => f)
      }

      w.close(1000, 'Close handle was called', { keepClosed: true, ...options })
      currentListenKey = null
    }
  }

  const makeStream = isReconnecting => {
    return new Promise((resolve) => {
      getDataStream()
      .then(({ listenKey }) => {
        w = openWebSocket(`${BASE}/${listenKey}`)
        w.onmessage = msg => userEventHandler(cb)(msg)

        currentListenKey = listenKey

        int = setInterval(() => keepAlive(false), 50e3)

        keepAlive(true)

        resolve({
          closeStream: options => closeStream(options),
          ws: w
        })      
      })
      .catch(err => {
        if (isReconnecting) {
          setTimeout(() => { resolve(makeStream(true)) }, 30e3)
        } else {
          throw err
        }
      })
    })
  }

  return makeStream(false)
}

export default opts => ({
  depth,
  partialDepth,
  candles,
  trades,
  aggTrades,
  ticker,
  allTickers,
  user: user(opts),
})
