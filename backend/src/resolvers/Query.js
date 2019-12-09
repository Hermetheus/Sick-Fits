const { forwardTo } = require("prisma-binding");
const { hasPermission } = require("../utils");

const Query = {
  items: forwardTo("db"),
  item: forwardTo("db"),
  itemsConnection: forwardTo("db"),
  me(parent, args, ctx, info) {
    // me(...) shorthand method in es6
    // Check if there is a current user ID
    if (!ctx.request.userId) {
      return null;
    }
    return ctx.db.query.user(
      {
        where: { id: ctx.request.userId }
      },
      info
    );
  },
  async users(parent, args, ctx, info) {
    // check if they are logged in
    if (!ctx.request.userId) {
      throw new Error("You must be logged in!");
    }
    // check if user has permissions to query all users
    hasPermission(ctx.request.user, ["ADMIN", "PERMISSIONUPDATE"]);
    // if they do, query all the users
    return ctx.db.query.users({}, info);
  }
  // async items(parent, args, ctx, info) {
  //   console.log("getting items");
  //   const items = await ctx.db.query.items();
  //   return items;
  // }
};

module.exports = Query;
