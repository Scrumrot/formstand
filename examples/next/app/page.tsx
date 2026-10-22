import { SignupForm } from "./SignupForm";

// A server component: it renders the client form and nothing else. The
// form's values never cross this boundary; the server action in
// actions.ts is what receives them, and it re-parses them with the schema.
const Page = () => (
  <main className="page">
    <h1>Sign up</h1>
    <p className="lede">
      A formstand form submitting through a Next.js server action. The browser
      validates before the action runs; the action validates again with the
      same zod schema, because it is a network endpoint any client can call.
    </p>
    <SignupForm />
  </main>
);

// Next's app router requires the page as the module's default export.
export default Page;
