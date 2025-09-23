import { describe, expect, test } from "bun:test";
import { GatewayClient } from "../src/client/gateway";
import type { ClientAction } from "../src/client/state";

type SentPayload = { type: string; [key: string]: unknown };

const createStubbedGateway = () => {
  const dispatched: ClientAction[] = [];
  const gateway = new GatewayClient({
    dispatch: (action: ClientAction) => {
      dispatched.push(action);
    },
  });

  const sent: SentPayload[] = [];
  (gateway as unknown as { socket: unknown }).socket = {
    readyState: 1,
    OPEN: 1,
    send(payload: string) {
      sent.push(JSON.parse(payload) as SentPayload);
    },
  };

  return { gateway, sent, dispatched };
};

describe("GatewayClient", () => {
  test("joinChannel sends canonical payload", () => {
    const { gateway, sent } = createStubbedGateway();

    gateway.joinChannel("channel-123", 25);

    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual({
      type: "join_channel",
      channelId: "channel-123",
      limit: 25,
    });
  });

  test("sendChatMessage forwards optional clientId", () => {
    const { gateway, sent } = createStubbedGateway();

    gateway.sendChatMessage({
      channelId: "channel-123",
      content: "Hello world",
      clientId: "client-temp-1",
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      type: "send_message",
      channelId: "channel-123",
      content: "Hello world",
      clientId: "client-temp-1",
    });
  });

  test("acknowledgeHistory skips empty payloads", () => {
    const { gateway, sent } = createStubbedGateway();

    gateway.acknowledgeHistory("channel-123", []);
    expect(sent).toHaveLength(0);

    gateway.acknowledgeHistory("channel-123", ["msg-1", "msg-2"]);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual({
      type: "ack_history",
      channelId: "channel-123",
      messageIds: ["msg-1", "msg-2"],
    });
  });
});
