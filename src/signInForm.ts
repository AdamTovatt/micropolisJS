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

export type FormStep = {done: true} | {done: false; error: string};

// What the form does after a sign-in, decided here so it is tested under node: a refusal shows the server's reason
// and keeps the form open for another try, and anything else lets the game start, signed in or not
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
// stored or the server refuses the stored name. Resolves once the game can start, online or not.
export async function signInIfServerAnswers(client: CityClient): Promise<void> {
  const started = await client.start();

  if (started !== "needs-name") {
    return;
  }

  const container = document.getElementById("signIn") as HTMLElement;
  const form = document.getElementById("signInForm") as HTMLFormElement;
  const nameInput = document.getElementById("signInName") as HTMLInputElement;
  const submit = document.getElementById("signInSubmit") as HTMLInputElement;
  const error = document.getElementById("signInError") as HTMLElement;

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
