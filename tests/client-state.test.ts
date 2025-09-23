import { describe, expect, test } from "bun:test";
import {
  clientReducer,
  initialState,
  reduceGatewayEvent,
  type ClientAction,
  type ClientState,
} from "../src/client/state";
import type { GatewayServerEvent, Message, User } from "../src/shared/types";

const baseUser: User = {
  id: "user-1",
  username: "guest-123",
  displayName: "Test Guest",
  status: "online",
  avatarUrl: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const createMessage = (overrides: Partial<Message> = {}): Message => {
  const timestamp = new Date().toISOString();
  return {
    id: "msg-1",
    guildId: "guild-1",
    channelId: "channel-1",
    authorId: baseUser.id,
    content: "Hello world",
    replyToId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
};

const cloneState = (): ClientState => structuredClone(initialState);

describe("client state reducer", () => {
  test("message_created clears matching optimistic entry", () => {
    const startingState = cloneState();
    startingState.optimisticMessages = {
      "client-1": {
        clientId: "client-1",
        channelId: "channel-1",
        content: "Hello world",
        createdAt: new Date().toISOString(),
        status: "pending",
      },
    };
    startingState.messagesByChannel = {
      "channel-1": {
        messages: [],
        fetchedAt: null,
        hasLoadedInitial: true,
      },
    };

    const gatewayEvent: GatewayServerEvent = {
      type: "message_created",
      message: createMessage({ id: "server-msg-1" }),
      author: baseUser,
      reactions: [],
      clientId: "client-1",
    };

    const action = reduceGatewayEvent(gatewayEvent) as ClientAction;
    const nextState = clientReducer(startingState, action);

    expect(nextState.optimisticMessages["client-1"]).toBeUndefined();
    const channelLog = nextState.messagesByChannel["channel-1"];
    expect(channelLog).toBeDefined();
    expect(channelLog?.messages).toHaveLength(1);
    expect(channelLog?.messages[0]?.id).toBe("server-msg-1");
  });

  test("command_error marks optimistic entry as failed", () => {
    const startingState = cloneState();
    startingState.optimisticMessages = {
      "client-err": {
        clientId: "client-err",
        channelId: "channel-2",
        content: "This will fail",
        createdAt: new Date().toISOString(),
        status: "pending",
      },
    };

    const errorEvent: GatewayServerEvent = {
      type: "command_error",
      command: "history",
      error: "Join the channel before sending messages",
      clientId: "client-err",
    };

    const action = reduceGatewayEvent(errorEvent) as ClientAction;
    const nextState = clientReducer(startingState, action);

    const failed = nextState.optimisticMessages["client-err"];
    expect(failed).toBeDefined();
    expect(failed?.status).toBe("error");
    expect(failed?.error).toBe(
      "Join the channel before sending messages",
    );
  });
});
