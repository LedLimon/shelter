// A scripted SMTP server on a local port: takes any message and keeps it, or
// refuses the recipient with the reply a test gives it. For what Mailpit
// can't play — a server that says no — and for unit tests, which run without
// Docker.
import { createServer, type Socket } from "node:net";
import type { AddressInfo } from "node:net";

export type FakeSmtp = {
  port: number;
  /** Accepted messages as they came over the wire: headers and body. */
  messages: string[];
  close(): Promise<void>;
};

export type FakeSmtpOptions = {
  /** The reply to RCPT TO instead of «250», e.g. `550 5.1.1 <a@b>: no such user`. */
  rcptReply?: string;
};

export async function startFakeSmtp(
  options: FakeSmtpOptions = {},
): Promise<FakeSmtp> {
  const messages: string[] = [];
  const sockets = new Set<Socket>();

  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => socket.destroy());

    let buffer = "";
    let inData = false;
    const reply = (line: string) => socket.write(`${line}\r\n`);
    reply("220 fake.localhost ESMTP");

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      for (;;) {
        if (inData) {
          const end = buffer.indexOf("\r\n.\r\n");
          if (end === -1) return;
          messages.push(buffer.slice(0, end));
          buffer = buffer.slice(end + 5);
          inData = false;
          reply("250 2.0.0 queued");
          continue;
        }
        const end = buffer.indexOf("\r\n");
        if (end === -1) return;
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const command = line.slice(0, 4).toUpperCase();
        if (command === "EHLO") {
          socket.write(
            "250-fake.localhost\r\n250-8BITMIME\r\n250 SMTPUTF8\r\n",
          );
        } else if (command === "RCPT") {
          reply(options.rcptReply ?? "250 2.1.5 ok");
        } else if (command === "DATA") {
          inData = true;
          reply("354 go ahead");
        } else if (command === "QUIT") {
          reply("221 2.0.0 bye");
          socket.end();
        } else {
          reply("250 2.0.0 ok");
        }
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  return {
    port: (server.address() as AddressInfo).port,
    messages,
    close: () =>
      new Promise((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}
