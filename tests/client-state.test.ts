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

  test("reactionOptimisticToggled updates reaction list", () => {
    const startingState = cloneState();
    const message = createMessage();
    startingState.messagesByChannel = {
      "channel-1": {
        messages: [{ ...message, author: baseUser, reactions: [] }],
        fetchedAt: null,
        hasLoadedInitial: true,
      },
    };

    const nextState = clientReducer(startingState, {
      type: "channel/reactionOptimisticToggled",
      payload: {
        channelId: "channel-1",
        messageId: message.id,
        emoji: ":thumbsup:",
        userId: baseUser.id,
      },
    });

    const reactions =
      nextState.messagesByChannel["channel-1"]?.messages[0]?.reactions ?? [];
    expect(reactions.some((reaction) => reaction.emoji === ":thumbsup:" && reaction.authorId === baseUser.id)).toBe(true);
  });

  test("reactions_updated replaces reaction list", () => {
    const startingState = cloneState();
    const message = createMessage();
    startingState.messagesByChannel = {
      "channel-1": {
        messages: [{ ...message, author: baseUser, reactions: [] }],
        fetchedAt: null,
        hasLoadedInitial: true,
      },
    };

    const serverEvent: GatewayServerEvent = {
      type: "reactions_updated",
      channelId: "channel-1",
      messageId: message.id,
      reactions: [
        {
          messageId: message.id,
          emoji: ":heart:",
          authorId: baseUser.id,
          createdAt: new Date().toISOString(),
        },
      ],
    };

    const action = reduceGatewayEvent(serverEvent) as ClientAction;
    const nextState = clientReducer(startingState, action);

    const reactions =
      nextState.messagesByChannel["channel-1"]?.messages[0]?.reactions ?? [];
    expect(reactions).toHaveLength(1);
    expect(reactions[0]?.emoji).toBe(":heart:");
  });

  test("messageEditOptimistic updates content and tracks mutation", () => {
    const startingState = cloneState();
    const message = createMessage();
    const enriched = { ...message, author: baseUser, reactions: [] };
    startingState.messagesByChannel = {
      "channel-1": {
        messages: [enriched],
        fetchedAt: null,
        hasLoadedInitial: true,
      },
    };

    const nextState = clientReducer(startingState, {
      type: "channel/messageEditOptimistic",
      payload: {
        channelId: "channel-1",
        messageId: message.id,
        nextContent: "Edited",
        requestId: "req-1",
        optimisticUpdatedAt: new Date().toISOString(),
      },
    });

    const edited = nextState.messagesByChannel["channel-1"]?.messages[0];
    expect(edited?.content).toBe("Edited");
    expect(nextState.optimisticMutations["req-1"]).toBeDefined();
  });

  test("messageUpdated clears optimistic mutation", () => {
    const startingState = cloneState();
    const message = createMessage();
    const enriched = { ...message, author: baseUser, reactions: [] };
    startingState.messagesByChannel = {
      "channel-1": {
        messages: [enriched],
        fetchedAt: null,
        hasLoadedInitial: true,
      },
    };
    startingState.optimisticMutations = {
      "req-2": {
        type: "edit",
        requestId: "req-2",
        channelId: "channel-1",
        messageId: message.id,
        previousContent: "Hello world",
        previousUpdatedAt: message.updatedAt,
      },
    };

    const nextState = clientReducer(startingState, {
      type: "channel/messageUpdated",
      payload: {
        message: { ...message, content: "Server" },
        clientRequestId: "req-2",
      },
    });

    const edited = nextState.messagesByChannel["channel-1"]?.messages[0];
    expect(edited?.content).toBe("Server");
    expect(nextState.optimisticMutations["req-2"]).toBeUndefined();
  });

  test("mutationFailed reverts edit and surfaces error", () => {
    const startingState = cloneState();
    const message = createMessage();
    const enriched = { ...message, author: baseUser, reactions: [] };
    startingState.messagesByChannel = {
      "channel-1": {
        messages: [enriched],
        fetchedAt: null,
        hasLoadedInitial: true,
      },
    };
    startingState.optimisticMutations = {
      "req-3": {
        type: "edit",
        requestId: "req-3",
        channelId: "channel-1",
        messageId: message.id,
        previousContent: "Hello world",
        previousUpdatedAt: message.updatedAt,
      },
    };

    const nextState = clientReducer(startingState, {
      type: "channel/mutationFailed",
      requestId: "req-3",
      error: "Only authors can edit",
    });

    const restored = nextState.messagesByChannel["channel-1"]?.messages[0];
    expect(restored?.content).toBe("Hello world");
    expect(nextState.ui.commandError).toBe("Only authors can edit");
  });

  test("reduceGatewayEvent returns mutation failure actions for edit errors", () => {
    const event: GatewayServerEvent = {
      type: "command_error",
      command: "edit",
      error: "You can only edit your own messages",
      clientId: "req-4",
    };

    const actions = reduceGatewayEvent(event);
    expect(Array.isArray(actions)).toBe(true);
    if (Array.isArray(actions)) {
      expect(actions.length).toBe(2);
      const mutationAction = actions[0]!;
      const uiAction = actions[1]!;
      expect(mutationAction.type).toBe("channel/mutationFailed");
      expect(uiAction.type).toBe("ui/setCommandError");
    }
  });

  test("typing_started registers active typers and discards expired entries", () => {
    const startingState = cloneState();
    startingState.typingByChannel = {
      "channel-1": {
        "stale-user": new Date(Date.now() - 10_000).toISOString(),
      },
    };

    const event: GatewayServerEvent = {
      type: "typing_started",
      channelId: "channel-1",
      userId: "user-42",
      expiresAt: new Date(Date.now() + 5_000).toISOString(),
    };

    const action = reduceGatewayEvent(event) as ClientAction;
    const nextState = clientReducer(startingState, action);

    expect(nextState.typingByChannel["channel-1"]?.["user-42"]).toBe(event.expiresAt);
    expect(nextState.typingByChannel["channel-1"]?.["stale-user"]).toBeUndefined();
  });

  test("typing_stopped removes typers from channel bucket", () => {
    const startingState = cloneState();
    startingState.typingByChannel = {
      "channel-1": {
        "user-42": new Date(Date.now() + 5_000).toISOString(),
      },
    };

    const event: GatewayServerEvent = {
      type: "typing_stopped",
      channelId: "channel-1",
      userId: "user-42",
    };

    const action = reduceGatewayEvent(event) as ClientAction;
    const nextState = clientReducer(startingState, action);

    expect(nextState.typingByChannel["channel-1"]).toBeUndefined();
  });
});
