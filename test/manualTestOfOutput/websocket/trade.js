const Binance = require('../../../dist/index').default;

const client = Binance();

client.ws.trades(['BTCUSDT', 'ETHBTC'], (trade) => {
    console.log(trade);
});     