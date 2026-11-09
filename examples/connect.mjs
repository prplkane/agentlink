import { stripVTControlCharacters } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { agentlink } from '@prplkane/agentlink';

const display = value => stripVTControlCharacters(String(value ?? '')).replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '');
const label = value => display(value).replace(/[\r\n\t]/g, ' ');

const [profile, ...words] = process.argv.slice(2);
if (!profile || !words.length) {
  console.error('Usage: node /path/to/agentlink/examples/connect.mjs <profile> "Your task"');
  process.exitCode = 2;
} else {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  let agent;
  try {
    agent = await agentlink.connect(profile, {
      cwd: process.cwd(),
      onUpdate(update) {
        if (update.sessionUpdate === 'agent_message_chunk' && update.content?.type === 'text') process.stdout.write(display(update.content.text));
      },
      async onPermission(request, { signal }) {
        console.log(`\n${label(request.toolCall?.title || 'Agent permission request')}`);
        request.options.forEach((option, index) => console.log(`${index + 1}. ${label(option.name)} (${label(option.kind)})`));
        try {
          const answer = await terminal.question('Choose a number, or Enter to cancel: ', { signal });
          const index = Number(answer) - 1;
          return Number.isInteger(index) && index >= 0 ? request.options[index]?.optionId ?? null : null;
        } catch { return null; }
      }
    });
    await agent.prompt(words.join(' '), { timeoutMs: 120000 });
    process.stdout.write('\n');
  } catch (cause) {
    console.error(`${cause.code || 'ERROR'}: ${label(cause.message)}`);
    process.exitCode = 1;
  } finally {
    terminal.close();
    await agent?.close();
  }
}
