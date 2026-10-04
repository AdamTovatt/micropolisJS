/* micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
 *
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details. Alternatively,
 * consult http://micropolisjs.graememcc.co.uk/LICENSE and
 * http://micropolisjs.graememcc.co.uk/COPYING
 *
 * The name/term "MICROPOLIS" is a registered trademark of Micropolis (https://www.micropolis.com) GmbH
 * (Micropolis Corporation, the "licensor") and is licensed here to the authors/publishers of the "Micropolis"
 * city simulation game and its source code (the project or "licensee(s)") as a courtesy of the owner.
 *
 */

import { CityClient, SignInResult } from "./cityClient";
import { requiredElement } from "./domElements";

export type FormStep = {done: true} | {done: false; error: string};

// What the form does after a sign-in, decided here so it is tested under node: a refusal shows the server's reason
// and keeps the form open for another try, and anything else moves on, signed in or not: the page then plays once the
// server welcomes the player, which the client keeps trying for (CityClient.welcomed)
export function formStep(result: SignInResult): FormStep {
  switch (result.outcome) {
    case "rejected":
    case "too-many":
      return {done: false, error: result.error};
    default:
      return {done: true};
  }
}

// Before the splash screen: connects to the server when one answers, asking for a display name when no session is
// stored or the server refuses the stored name. Resolves once signing in is over, online or not.
export async function signInIfServerAnswers(client: CityClient): Promise<void> {
  const started = await client.start();

  if (started !== "needs-name") {
    return;
  }

  const container = requiredElement("signIn");
  const form = requiredElement("signInForm", HTMLFormElement);
  const nameInput = requiredElement("signInName", HTMLInputElement);
  const submit = requiredElement("signInSubmit", HTMLInputElement);
  const error = requiredElement("signInError");

  container.style.display = "block";
  nameInput.focus();

  await new Promise<void>((resolve) => {
    form.onsubmit = async (event) => {
      event.preventDefault();
      submit.disabled = true;
      error.textContent = "";

      const step = formStep(await client.signIn(nameInput.value));
      submit.disabled = false;

      if (!step.done) {
        error.textContent = step.error;
        nameInput.focus();
        return;
      }

      form.onsubmit = null;
      container.style.display = "none";
      resolve();
    };
  });
}
