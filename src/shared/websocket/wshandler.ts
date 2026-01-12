import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import { handleIncomingMessage, onConnect, onDisconnect } from "../../features/chat/controllers/websocket.controller";
import url from "url";

export const setupWebSocket = (server: http.Server) => {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws: WebSocket, req) => {
    const queryParams = url.parse(req.url || "", true).query;
    const userId = queryParams.userId as string;

    if (!userId) {
      ws.close(1008, "userId is required");
      return;
    }

    onConnect(ws, userId);

    ws.on("message", (msg) => {
      void handleIncomingMessage(ws, msg.toString());
    });

    ws.on("close", () => {
      onDisconnect(ws);
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
    });
  });

  console.log("WebSocket layer ready");
};
