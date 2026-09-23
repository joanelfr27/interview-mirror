export default class OpenAI {
  constructor() {
    this.chat = {
      completions: {
        create: async () => {
          throw new Error("OpenAI SDK call invoked during canonical tests; provide an explicit AI integration test mock.");
        },
      },
    };
  }
}
