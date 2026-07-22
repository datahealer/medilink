import { Redirect } from "expo-router";

/** Entry route — always send the user to the splash screen, which decides where next. */
export default function Index() {
  return <Redirect href="/splash" />;
}
