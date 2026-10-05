import { config } from './config';
import { dateKey, dhakaParts, isWeekday } from './calendar';
import { closeSlackSession, loginToSlack } from './login';
import { log, logBlock } from './logger';
import { buildEodMessage, parseTaskUpdates, type TaskUpdate } from './parser';
import { clearLocalPostedFlag, hasLocalPostedFlag, markLocalPosted } from './posted-state';
import { deleteTodaysEod, getMyMessagesToday, hasTodaysEod, postToChannel } from './slack';

export { buildEodMessage };

function wantsForceReplace(): boolean {
  return process.argv.includes('--force') || process.argv.includes('--replace');
}

export async function generateEOD(): Promise<{
  status: 'posted' | 'skipped_empty' | 'skipped_duplicate' | 'dry_run' | 'error';
  message?: string;
  emrCount: number;
  crmCount: number;
}> {
  const today = dhakaParts();
  const force = wantsForceReplace();
  const sourceA = config.slack.channels.sourceA.name;
  const sourceB = config.slack.channels.sourceB.name;
  const eodChannel = config.slack.channels.eod.name;

  log(`EOD run started (${dateKey(today)} ${config.timezone}, weekday=${isWeekday(today)})`);
  log(`dryRun=${config.dryRun} headed=${config.headed} force=${force}`);

  if (force) {
    clearLocalPostedFlag();
  }

  if (hasLocalPostedFlag() && !config.dryRun && !force) {
    log('Skip posting — local posted flag already set for today (single-post guard).');
    return { status: 'skipped_duplicate', emrCount: 0, crmCount: 0 };
  }

  let session = null as Awaited<ReturnType<typeof loginToSlack>> | null;

  try {
    session = await loginToSlack();
    const { page } = session;

    log(`Scanning #${sourceA}`);
    const primaryMessages = await getMyMessagesToday(page, 'sourceA');
    const primaryUpdates: TaskUpdate[] = parseTaskUpdates(primaryMessages);
    log(`Source A parsed updates: ${primaryUpdates.length}`);

    let secondaryUpdates: TaskUpdate[] = [];
    log(`Scanning #${sourceB}`);
    try {
      const secondaryMessages = await getMyMessagesToday(page, 'sourceB');
      secondaryUpdates = parseTaskUpdates(secondaryMessages);
      log(`Source B parsed updates: ${secondaryUpdates.length}`);
    } catch (secondaryErr) {
      const msg = secondaryErr instanceof Error ? secondaryErr.message : String(secondaryErr);
      log(`Source B channel skipped (non-fatal): ${msg}`);
    }

    const allUpdates = [...primaryUpdates, ...secondaryUpdates];

    if (!allUpdates.length) {
      log('No task updates found today.');
      return { status: 'skipped_empty', emrCount: 0, crmCount: 0 };
    }

    const eodMessage = buildEodMessage(allUpdates);
    logBlock('EOD content', eodMessage);

    if (force && !config.dryRun) {
      const removed = await deleteTodaysEod(page);
      log(`Force replace: cleared ${removed} existing EOD message(s)`);
    }

    const alreadyPosted = await hasTodaysEod(page);
    if (alreadyPosted && !force) {
      markLocalPosted(eodMessage);
      log(`Skip posting — today's EOD already exists in #${eodChannel}.`);
      return {
        status: 'skipped_duplicate',
        message: eodMessage,
        emrCount: primaryUpdates.length,
        crmCount: secondaryUpdates.length,
      };
    }

    if (config.dryRun) {
      log('DRY RUN complete — not posting.');
      return {
        status: 'dry_run',
        message: eodMessage,
        emrCount: primaryUpdates.length,
        crmCount: secondaryUpdates.length,
      };
    }

    if (force && alreadyPosted) {
      log(
        'WARNING: An EOD: message is still visible after delete attempt — posting corrected EOD anyway. Please remove the old one in Slack if it remains.'
      );
    }

    await postToChannel(page, 'eod', eodMessage, { skipDuplicateGuard: force });
    markLocalPosted(eodMessage);
    log('Post status: posted (once)');
    return {
      status: 'posted',
      message: eodMessage,
      emrCount: primaryUpdates.length,
      crmCount: secondaryUpdates.length,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.stack || error.message : String(error);
    log(`ERROR: ${msg}`);
    return { status: 'error', emrCount: 0, crmCount: 0 };
  } finally {
    if (session) await closeSlackSession(session);
    log('EOD run finished');
  }
}

async function main(): Promise<void> {
  const result = await generateEOD();
  if (result.status === 'error') process.exitCode = 1;
}

const isDirectRun = /(?:^|[\\/])eod\.(?:ts|js|mts|cjs)$/i.test(process.argv[1] || '');
if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
