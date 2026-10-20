import http, { gateway } from './api/index.ts';

http.listen(Number(process.env.PORT || 3000), process.env.HOST || '0.0.0.0', () => {
  console.log('Nearwork API and realtime listening', http.address());
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => { void gateway.close().finally(() => process.exit()); });
}
