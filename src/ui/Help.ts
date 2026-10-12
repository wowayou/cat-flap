import type { Strings } from './strings.ts';

/** Native modal: traps focus, makes the game inert, and supports Escape without custom key handling. */
export class Help {
  private readonly dialog: HTMLDialogElement;

  constructor(doc: Document, strings: Strings, private readonly change: (open: boolean) => void) {
    this.dialog = doc.querySelector<HTMLDialogElement>('#help')!;
    this.dialog.querySelector('h2')!.textContent = strings.help;
    const content = this.dialog.querySelector('.help-content')!;
    for (const step of strings.helpSteps) {
      const heading = doc.createElement('h3');
      heading.textContent = step.title;
      const text = doc.createElement('p');
      text.textContent = step.text;
      content.append(heading, text);
    }
    const close = this.dialog.querySelector('button')!;
    close.textContent = strings.closeHelp;
    close.addEventListener('click', () => this.dialog.close());
    // Hand input back only after the closing key's own dispatch has finished: some engines close
    // the dialog on Escape before the window sees that keydown, which would otherwise unpause.
    this.dialog.addEventListener('close', () => setTimeout(() => this.change(false), 0));
  }

  open(): void {
    // Very old browsers lack modal dialogs; never disable controls for a dialog that can't open.
    if (this.dialog.open || typeof this.dialog.showModal !== 'function') return;
    this.change(true);
    try {
      this.dialog.showModal();
    } catch {
      this.change(false);
    }
  }
}
