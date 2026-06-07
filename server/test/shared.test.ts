import { describe, it, expect, beforeEach } from 'vitest';
import { connectRoom } from './helpers/ws';

describe('shared presentation features', () => {
  let roomId: string;
  let presenter: Awaited<ReturnType<typeof connectRoom>>;
  let participant: Awaited<ReturnType<typeof connectRoom>>;

  beforeEach(async () => {
    roomId = `shared-${crypto.randomUUID()}`;
    presenter = await connectRoom({ role: 'presenter', email: 'admin@test.com', name: 'Admin', roomId });
    await presenter.waitFor((m) => m.type === 'WELCOME');
    participant = await connectRoom({ role: 'participant', email: 'user@test.com', name: 'User', roomId });
    await participant.waitFor((m) => m.type === 'WELCOME');
  });

  it('broadcasts SYNC_STEP when presenter changes step', async () => {
    presenter.send({ type: 'STEP_CHANGE', stepIndex: 3 });
    const sync = await participant.waitFor((m) => m.type === 'SYNC_STEP' && m.stepIndex === 3);
    expect(sync.stepIndex).toBe(3);
  });

  it('denies participant STEP_CHANGE', async () => {
    const countBefore = participant.messages.filter((m) => m.type === 'SYNC_STEP').length;
    participant.send({ type: 'STEP_CHANGE', stepIndex: 5 });
    await new Promise((r) => setTimeout(r, 200));
    const countAfter = participant.messages.filter((m) => m.type === 'SYNC_STEP').length;
    expect(countAfter).toBe(countBefore);
  });

  it('aggregates choice poll votes and broadcasts POLL_UPDATES', async () => {
    participant.send({ type: 'SUBMIT_VOTE', pollId: 'workshop_feel', choice: 'The speed' });
    const update = await participant.waitFor(
      (m) => m.type === 'POLL_UPDATES' && m.pollId === 'workshop_feel',
    );
    expect((update.results as Record<string, number>)['The speed']).toBe(1);

    participant.send({ type: 'SUBMIT_VOTE', pollId: 'workshop_feel', choice: 'The speed' });
    const toggled = await participant.waitFor(
      (m) => m.type === 'POLL_UPDATES' && (m.results as Record<string, number>)['The speed'] === 0,
    );
    expect((toggled.results as Record<string, number>)['The speed']).toBe(0);
  });

  it('aggregates slider poll values', async () => {
    participant.send({ type: 'SUBMIT_VOTE', pollId: 'role_preference', choice: '0.75', pollType: 'slider1d' });
    const update = await participant.waitFor(
      (m) => m.type === 'POLL_UPDATES' && m.pollId === 'role_preference' && Array.isArray(m.values),
    );
    expect(update.values as string[]).toContain('0.75');
  });

  it('resets poll when presenter sends RESET_POLL', async () => {
    participant.send({ type: 'SUBMIT_VOTE', pollId: 'workshop_feel', choice: 'Learning it' });
    await participant.waitFor((m) => m.type === 'POLL_UPDATES' && m.pollId === 'workshop_feel');

    presenter.send({ type: 'RESET_POLL', pollId: 'workshop_feel' });
    await participant.waitFor((m) => m.type === 'POLL_RESET' && m.pollId === 'workshop_feel');
  });

  it('does not double-count a choice vote when the same participant reconnects', async () => {
    participant.send({ type: 'SUBMIT_VOTE', pollId: 'workshop_feel', choice: 'The speed' });
    const first = await participant.waitFor(
      (m) => m.type === 'POLL_UPDATES' && m.pollId === 'workshop_feel',
    );
    expect((first.results as Record<string, number>)['The speed']).toBe(1);

    participant.close();
    const reconnected = await connectRoom({ role: 'participant', email: 'user@test.com', name: 'User', roomId });
    await reconnected.waitFor((m) => m.type === 'WELCOME');

    // Voting the same choice again should toggle it off (count → 0), not add a second entry (count → 2)
    reconnected.send({ type: 'SUBMIT_VOTE', pollId: 'workshop_feel', choice: 'The speed' });
    const second = await reconnected.waitFor(
      (m) => m.type === 'POLL_UPDATES' && m.pollId === 'workshop_feel',
    );
    expect((second.results as Record<string, number>)['The speed']).toBe(0);
  });

  it('does not duplicate a slider value when the same participant reconnects', async () => {
    participant.send({ type: 'SUBMIT_VOTE', pollId: 'role_preference', choice: '0.25', pollType: 'slider1d' });
    const first = await participant.waitFor(
      (m) => m.type === 'POLL_UPDATES' && m.pollId === 'role_preference' && Array.isArray(m.values),
    );
    expect((first.values as string[]).length).toBe(1);

    participant.close();
    const reconnected = await connectRoom({ role: 'participant', email: 'user@test.com', name: 'User', roomId });
    await reconnected.waitFor((m) => m.type === 'WELCOME');

    // Submitting again should upsert the existing record, not add a second one
    reconnected.send({ type: 'SUBMIT_VOTE', pollId: 'role_preference', choice: '0.75', pollType: 'slider1d' });
    const second = await reconnected.waitFor(
      (m) => m.type === 'POLL_UPDATES' && m.pollId === 'role_preference' && Array.isArray(m.values),
    );
    expect((second.values as string[]).length).toBe(1);
    expect((second.values as string[])[0]).toBe('0.75');
  });

  it('broadcasts CONNECTED_USERS when clients join', async () => {
    const usersMsg = await presenter.waitFor(
      (m) =>
        m.type === 'CONNECTED_USERS' &&
        (m.users as { name: string }[]).some((u) => u.name === 'User'),
    );
    const users = usersMsg.users as { name: string }[];
    expect(users.some((u) => u.name === 'Admin')).toBe(true);
    expect(users.some((u) => u.name === 'User')).toBe(true);
  });
});
