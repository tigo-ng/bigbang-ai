import { boot } from "quasar/wrappers";
import axios from "axios";

import { defineStore } from "pinia";
import { graphql, buildSchema } from "graphql";

import {
  ClientEvent,
  RoomMemberEvent,
  RoomEvent,
  createClient,
} from "matrix-js-sdk";

// 配置文件
const configs = {
  homeservers: {
    "synapse.dev": {
      api_url: "http://localhost:8008",
      api_key: "@bot:synapse.dev",
      api_admin_key: "@admin:synapse.dev",
      api_secret: "syt_Ym90_RVBQdfSpGGyWmWADRpOV_31i439",
    },
  },
  services: {
    ollama: {
      api_url: "http://localhost:11434",
    },
  },
};

const api = axios.create({ baseURL: configs.services["ollama"].api_url });

// 状态层
const useCounterStore = defineStore("counter", {
  state: () => ({
    counter: 0,
  }),

  getters: {
    doubleCount: (state) => state.counter * 2,
  },

  actions: {
    increment() {
      this.counter++;
    },
  },
});

const store = useCounterStore();

// 服务层
const schema = buildSchema(`
  type Query {
    counter: Int
    doubleCount: Int

    chat(model: String, prompt: String!): String
  }

  type Mutation {
    increment: Int
  }
`);

const rootValue = {
  counter: () => {
    return store.counter;
  },

  doubleCount: () => {
    return store.doubleCount;
  },

  increment: () => {
    store.increment();
    return store.counter;
  },

  chat: async ({ model = "llama2", prompt }) => {
    return api({
      method: "post",
      url: "/api/generate",
      data: {
        model,
        prompt,
        stream: false,
      },
    }).then((result) => {
      const response = result.data.response;
      return JSON.stringify(response);
    });
  },
};

const bot = createClient({
  baseUrl: configs.homeservers["synapse.dev"].api_url,
  accessToken: configs.homeservers["synapse.dev"].api_secret,
  userId: configs.homeservers["synapse.dev"].api_key,
});

bot.once(ClientEvent.Sync, function (state, prevState, res) {
  if (state === "PREPARED") {
    console.log("prepared");
  } else {
    console.log(state);
    process.exit(1);
  }
});

bot.on(RoomMemberEvent.Membership, function (event, member) {
  if (
    member.membership === "invite" &&
    member.userId === configs.homeservers["synapse.dev"].api_key
  ) {
    bot.joinRoom(member.roomId).then(function () {
      console.log("Auto-joined %s", member.roomId);
    });
  }
});

bot.on(RoomEvent.Timeline, function (event, room, toStartOfTimeline) {
  if (toStartOfTimeline) {
    return; // don't print paginated results
  }

  if (event.getType() !== "m.room.message") {
    return; // only print messages
  }

  console.log(
    // the room name will update with m.room.name events automatically
    "(%s) %s :: %s",
    room.name,
    event.getSender(),
    event.getContent().body
  );

  if (!bot.isInitialSyncComplete()) {
    return;
  }

  if (
    event.getSender() === configs.homeservers["synapse.dev"].api_key ||
    event.getSender() !== configs.homeservers["synapse.dev"].api_admin_key ||
    event.getContent().msgtype !== "m.text"
  ) {
    return;
  }

  const source = event.getContent().body;

  graphql({ schema, source, rootValue }).then((result) => {
    const content = {
      body: !result.data ? source : JSON.stringify(result),
      msgtype: "m.text",
    };

    bot.sendEvent(room.roomId, "m.room.message", content, "", (err, res) => {
      console.log(err);
    });
  });
});

// "async" is optional;
// more info on params: https://v2.quasar.dev/quasar-cli/boot-files
export default boot(async ({ app } /* { app, router, ... } */) => {
  app.config.globalProperties.$bot = bot;

  // something to do
  await bot.startClient({ initialSyncLimit: 10 });
});

export { bot };
