export function createClient() {
  return {
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: "d14-test-user",
          },
        },
        error: null,
      }),
    },
    from() {
      throw new Error("Supabase persistence was reached during D14 gate test");
    },
  };
}
