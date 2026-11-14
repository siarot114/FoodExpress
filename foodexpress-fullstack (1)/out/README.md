# FoodExpress

An online food ordering website with **real accounts and a real database**. Customers sign up, order dishes, see a receipt, review their order history and cancel an order. Built with HTML, CSS and JavaScript on the front end, and [Supabase](https://supabase.com) (PostgreSQL + Auth) on the back end.

**Live site:** https://siarotlinus.netlify.app

## Features
- Sign up and log in (Supabase Auth)
- Browse the menu by category and add dishes to a cart
- Checkout with delivery details, review the summary, then confirm
- Orders are saved in PostgreSQL; the total is calculated by the database
- Receipt page, **My Orders** history, and cancel with a reason
- Row Level Security: every customer can only see and cancel **their own** orders

## Database
Two tables, `orders` and `order_items`, plus a `place_order()` function that saves an order and its items in one safe step. See [`supabase-setup.sql`](supabase-setup.sql).

## Set it up
1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the contents of `supabase-setup.sql`, and click **Run**.
3. Go to **Project Settings > API**. Copy the **Project URL** and the **anon public** key (it may be called the *publishable* key).
4. Paste both into `supabase-config.js`. Never paste the `service_role` key.
5. Go to **Authentication > Sign In / Providers > Email**. For easy testing, turn **Confirm email** off.
6. Open `index.html` through a local server or deploy the folder to Netlify. Then set **Authentication > URL Configuration > Site URL** to your site's address.

## Built with
HTML · CSS · JavaScript · Supabase · PostgreSQL · Netlify

## Known limits (a learning project)
- Dish prices come from the web page. A production shop would keep the menu and prices in a database table.
- Payment methods are choices only. No real payment is taken.

## Author
Linus Kerk Eubil M. Siarot · [Portfolio](https://siarot.netlify.app)
