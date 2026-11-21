async function test() {
  const url = "https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=BTC_USDT&interval=1m&limit=5";
  const res = await fetch(url);
  const data = await res.json();
  const now = Math.floor(Date.now() / 1000);
  console.log("Current time (UTC):", new Date().toISOString(), now);
  console.log("Gate.io raw data first:", data[0]);
  console.log("Gate.io raw data last:", data[data.length - 1]);
}
test();
