import { createServer, request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";

/** Real connection failure, rather than WebKit's broken offline emulation (#42775). */
export async function createNetworkProxy(baseURL: string) {
  let connected = true;
  const server = createServer((incoming, outgoing) => {
    if (!connected) { incoming.socket.destroy(); return; }
    const target = new URL(incoming.url ?? "/", baseURL);
    const forwarded = httpRequest(target, { method: incoming.method, headers: { ...incoming.headers, host: target.host } }, (response) => {
      outgoing.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(outgoing);
    });
    forwarded.on("error", () => outgoing.destroy());
    incoming.pipe(forwarded);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    setConnected: (value: boolean) => { connected = value; },
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}
