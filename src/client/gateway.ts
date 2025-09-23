import type { Dispatch } from "react";
import type { GatewayClientEvent, GatewayServerEvent, SlashCommand, Snowflake } from "../shared/types";
import type { ClientAction } from "./state";
import { reduceGatewayEvent } from "./state";

type GatewayClientOptions = {
  url?: string;
  dispatch: Dispatch<ClientAction>;
};

const parseServerPayload = (raw: string): GatewayServerEvent | null => {
  try {
    return JSON.parse(raw) as GatewayServerEvent;
  } catch (error) {
    console.error("Failed to parse gateway payload", error);
    return null;
  }
};

const DEFAULT_URL = "ws://localhost:3000";

export class GatewayClient {
  private socket: WebSocket | null = null;
  private readonly url: string;
  private readonly dispatch: Dispatch<ClientAction>;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private token: string | null = null;
  private intentionalClose = false;

  constructor(options: GatewayClientOptions) {
    this.url = options.url ?? DEFAULT_URL;
    this.dispatch = options.dispatch;
  }

  start(token: string) {
    this.token = token;
    this.intentionalClose = false;
    if (this.socket && this.socket.readyState === this.socket.OPEN) {
      this.socket.close();
    }
    this.connect();
  }

  stop() {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  joinChannel(channelId: Snowflake, limit?: number) {
    this.send({
      type: "join_channel",
      channelId,
      limit,
    });
  }

  leaveChannel(channelId: Snowflake) {
    this.send({
      type: "leave_channel",
      channelId,
    });
  }

  sendChatMessage(input: { channelId: Snowflake; content: string; replyToId?: Snowflake | null; clientId?: string }) {
    this.send({
      type: "send_message",
      channelId: input.channelId,
      content: input.content,
      replyToId: input.replyToId ?? null,
      clientId: input.clientId,
    });
  }

  acknowledgeHistory(channelId: Snowflake, messageIds: Snowflake[]) {
    if (messageIds.length === 0) {
      return;
    }
    this.send({
      type: "ack_history",
      channelId,
      messageIds,
    });
  }

  emitCommand(command: SlashCommand) {
    this.send({
      type: "emit_command",
      command,
    });
  }

  private connect() {
    if (!this.token) {
      throw new Error("GatewayClient#connect called without a token");
    }

    const wsUrl = new URL(this.url);
    wsUrl.searchParams.set("token", this.token);

    this.dispatch({ type: "connection/setPhase", phase: "connecting" });

    const socket = new WebSocket(wsUrl.toString());
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.dispatch({ type: "connection/setPhase", phase: "ready" });
      this.send({ type: "auth_init", token: this.token });
    });

    socket.addEventListener("message", (event) => {
      const payload = typeof event.data === "string" ? event.data : String(event.data);
      const parsed = parseServerPayload(payload);
      if (!parsed) {
        return;
      }

      const actions = reduceGatewayEvent(parsed);
      if (!actions) {
        return;
      }

      if (Array.isArray(actions)) {
        for (const action of actions) {
          this.dispatch(action);
        }
      } else {
        this.dispatch(actions);
      }
    });

    socket.addEventListener("close", (event) => {
      this.socket = null;
      this.dispatch({
        type: "connection/setPhase",
        phase: "closed",
        error: event.reason || undefined,
      });

      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    });

    socket.addEventListener("error", (event) => {
      console.error("WebSocket error", event);
      this.dispatch({ type: "connection/setPhase", phase: "reconnecting", error: "WebSocket error" });
    });
  }

  private scheduleReconnect() {
    if (!this.token) {
      return;
    }

    if (this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 1000);
  }

  private send(event: GatewayClientEvent) {
    const target = this.socket;
    if (!target || target.readyState !== target.OPEN) {
      return;
    }

    const payload = JSON.stringify(event);
    target.send(payload);
  }
}
