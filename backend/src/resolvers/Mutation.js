const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { hasPermission } = require('../utils');
const { randomBytes } = require('crypto');
const { promisify } = require('util');
const { transport, makeANiceEmail } = require('../mail');
const stripe = require('../stripe');

const Mutations = {
  async createItem(parent, args, ctx, info) {
    //TODO Check if they are logged in
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!');
    }

    const item = await ctx.db.mutation.createItem(
      {
        data: {
          // Provide a relationship between item & user
          user: {
            connect: {
              id: ctx.request.userId
            }
          },
          ...args
        }
      },
      info
    );

    console.log(item);
    return item;
  },
  updateItem(parent, args, ctx, info) {
    //first take a copy of the updates
    const updates = { ...args };
    // remove the ID from the updates
    delete updates.id;
    // run the update method
    return ctx.db.mutation.updateItem(
      {
        data: updates,
        where: {
          id: args.id
        }
      },
      info
    );
  },
  async deleteItem(parent, args, ctx, info) {
    const where = { id: args.id };
    // Find the item
    const item = await ctx.db.query.item(
      { where },
      `{ id, title, user { id } }`
    );
    // Check if they own that item or have permissions
    const ownsItem = item.user.id === ctx.request.userId;

    const hasPermissions = ctx.request.user.permissions.some(permission =>
      ['ADMIN', 'ITEMDELETE'].includes(permission)
    ); // some = atleast 1 is true
    // ['DOG', 'CAT'].some(pet => ['BIRD', ['SNAKE'].includes(pet)); == false
    // ['DOG', 'CAT'].some(pet => ['BIRD', 'SNAKE', 'CAT'].includes(pet)); == true
    if (!ownsItem && hasPermissions) {
      throw new Error("You don't have permission to do that!");
    }
    // Delete it
    return ctx.db.mutation.deleteItem({ where }, info);
  },
  async signup(parent, args, ctx, info) {
    // First - lower case email
    args.email = args.email.toLowerCase();
    // hash their password
    const password = await bcrypt.hash(args.password, 10);

    // Create user in database
    const user = await ctx.db.mutation.createUser(
      {
        data: {
          ...args,
          password,
          permissions: { set: ['USER'] }
        }
      },
      info
    );
    // Create JWT token for them
    const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET);
    // set JWT as a cookie on response
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365 // 1 year cookie)
    });
    return user;
  },
  async signin(parent, { email, password }, ctx, info) {
    // Check if there is a user
    const user = await ctx.db.query.user({ where: { email: email } });
    if (!user) {
      throw new Error(`No such user found for email ${email}`);
    }
    //check if password is correct
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new Error(`Invalid Password`);
    }
    // generate jwt token
    const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET);

    // set cookie with token
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365
    });
    // return user
    return user;
  },
  signout(parent, args, ctx, info) {
    ctx.response.clearCookie('token');
    return { message: 'Goodbye!' };
  },
  async requestReset(parent, args, ctx, info) {
    // Check if it's a real user
    const user = await ctx.db.query.user({ where: { email: args.email } });
    if (!user) {
      throw new Error(`No such user found for email ${args.email}`);
    }
    // set a reset token expiry on that user
    const randomBytesPromisifed = promisify(randomBytes);
    const resetToken = (await randomBytesPromisifed(20)).toString('hex');
    const resetTokenExpiry = Date.now() + 3600000; // 1 hour from now
    const res = await ctx.db.mutation.updateUser({
      where: { email: args.email },
      data: { resetToken, resetTokenExpiry }
    });
    // console.log(res);
    // email them a reset token
    const mailRes = await transport.sendMail({
      from: 'allanmolson@gmail.com',
      to: user.email,
      subject: 'Your Password Reset Token',
      html: makeANiceEmail(`Your Password Reset Token is Here! 
      \n\n 
      <a href="${process.env.FRONTEND_URL}/reset?resetToken=${resetToken}">Click here to Reset</a>`)
    });
    //  return the message
    return { message: 'Thanks!' };
  },
  async resetPassword(parent, args, ctx, info) {
    // check if passwords match
    if (args.password !== args.confirmPassword) {
      throw new Error('Your Passwords dont match!');
    }
    //check if it's a ligit reset token

    // check if it is expired
    const [user] = await ctx.db.query.users({
      where: {
        resetToken: args.resetToken,
        resetTokenExpiry_gte: Date.now() - 3600000
      }
    });
    if (!user) {
      throw new Error('This token is either invalid or expired');
    }
    // hash their new password
    const password = await bcrypt.hash(args.password, 10);

    // save the new password to the user and remove old reset token fields
    const updatedUser = await ctx.db.mutation.updateUser({
      where: {
        email: user.email
      },
      data: {
        password,
        resetToken: null,
        resetTokenExpiry: null
      }
    });
    // generate JWT
    const token = jwt.sign({ userId: updatedUser.id }, process.env.APP_SECRET);
    // Set the JWT cookie
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365
    });
    // return the new user
    return updatedUser;
  },
  async updatePermissions(parent, args, ctx, info) {
    // checked if they are logged in
    if (!ctx.request.userId) {
      throw new Error('You must be logged in');
    }
    // query current user
    const currentUser = await ctx.db.query.user(
      {
        where: {
          id: ctx.request.userId
        }
      },
      info
    );
    // check if they have permissions to do this
    hasPermission(currentUser, ['ADMIN', 'PERMISSIONUPDATE']);
    // update the permissions
    return ctx.db.mutation.updateUser(
      {
        data: {
          permissions: {
            set: args.permissions
          }
        },
        where: {
          id: args.userId
        }
      },
      info
    );
  },
  async addToCart(parent, args, ctx, info) {
    // make sure they are signed in
    const userId = ctx.request.userId;
    if (!userId) {
      throw new Error('You must be signed in soon!');
    }
    // query the users current cart
    const [existingCartItem] = await ctx.db.query.cartItems({
      where: {
        user: { id: userId },
        item: { id: args.id }
      }
    });
    console.log(existingCartItem);
    // check if that item is already in their cart increment by 1 if it is
    if (existingCartItem) {
      console.log('This item is already in their cart');
      return ctx.db.mutation.updateCartItem(
        {
          where: { id: existingCartItem.id },
          data: { quantity: existingCartItem.quantity + 1 }
        },
        info
      );
    }
    // if it's not create a fresh cart item for that user
    return ctx.db.mutation.createCartItem(
      {
        data: {
          user: {
            connect: { id: userId }
          },
          item: {
            connect: { id: args.id }
          }
        }
      },
      info
    );
  },
  async removeFromCart(parent, args, ctx, info) {
    // Find the cart item
    const cartItem = await ctx.db.query.cartItem(
      {
        where: {
          id: args.id
        }
      },
      `{ id, user { id }}`
    );

    // make sure we found an item
    if (!cartItem) throw new Error('No CartItem Found!');
    // make sure they own the cart item
    if (cartItem.user.id !== ctx.request.userId) {
      throw new Error('Cheatin huhh');
    }
    // delete the cart item
    return ctx.db.mutation.deleteCartItem(
      {
        where: { id: args.id }
      },
      info
    );
  },
  async createOrder(parent, args, ctx, info) {
    // query the current user and make sure they are signed in
    const { userId } = ctx.request;
    if (!userId)
      throw new Error('You must be signed in to complete this order.');
    const user = await ctx.db.query.user(
      { where: { id: userId } },
      `{ 
        id
       name
       email
       cart { 
         id 
         quantity 
         item { title price id description image largeImage }
        }}`
    );
    // recalculate the total for the price
    const amount = user.cart.reduce(
      (tally, cartItem) => tally + cartItem.item.price * cartItem.quantity,
      0
    );
    console.log(`going to charge for a total of ${amount}`);
    // create the stripe charge (turn token into $$)
    const charge = await stripe.charges.create({
      amount,
      currency: 'USD',
      source: args.token
    });
    // convert the cart items to order items
    const orderItems = user.cart.map(cartItem => {
      const orderItem = {
        ...cartItem.item,
        quantity: cartItem.quantity,
        user: { connect: { id: userId } }
      };
      delete orderItem.id;
      return orderItem;
    });
    // create the order
    const order = await ctx.db.mutation.createOrder({
      data: {
        total: charge.amount,
        charge: charge.id,
        items: { create: orderItems },
        user: { connect: { id: userId } }
      }
    });
    // clean up - clear users cart, delete cart items
    const cartItemIds = user.cart.map(cartItem => cartItem.id);
    await ctx.db.mutation.deleteManyCartItems({
      where: {
        id_in: cartItemIds
      }
    });
    // return the order to the client
    return order;
  }
};

module.exports = Mutations;

// createDog(parent, args, ctx, info) {
//   global.dogs = global.dogs || [];
//   // create a dog
//   const newDog = { name: args.name };
//   console.log(args);
//   global.dogs.push(newDog);
//   return newDog;
// }
