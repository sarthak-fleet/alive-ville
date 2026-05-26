import { getMemory,type MemoryStore, type Observation } from "./agent-town-memory.ts";
import type { CastMember } from "./agent-town-world.ts";

export interface GossipExchange {
  speakerId: string;
  listenerId: string;
  speakerLine: string;
  listenerLine: string;
  observationForListener: Observation | null;
}

const NAME_BY_ID = (members: CastMember[]) => Object.fromEntries(members.map((member) => [member.id, member.name]));

interface GossipContext {
  cast: CastMember[];
  memories: MemoryStore;
  now: number;
}

export function pickGossip(speaker: CastMember, listener: CastMember, ctx: GossipContext): GossipExchange {
  const names = NAME_BY_ID(ctx.cast);
  const speakerMem = getMemory(ctx.memories, speaker.id);
  const listenerMem = getMemory(ctx.memories, listener.id);

  const wonReport = speakerMem.observations.find((obs) => obs.kind === "saw-defeat" && obs.note === "player won");
  if (wonReport) {
    const subjectName = names[wonReport.subject ?? ""] ?? wonReport.subject ?? "them";
    return {
      speakerId: speaker.id,
      listenerId: listener.id,
      speakerLine: `Did you hear? Someone put ${subjectName} on the ground.`,
      listenerLine: `${subjectName}? That's actually impressive. Tell me everything.`,
      observationForListener: {
        kind: "saw-defeat",
        subject: wonReport.subject,
        note: `heard from ${speaker.name}`,
        at: ctx.now,
      },
    };
  }

  const lostReport = speakerMem.observations.find((obs) => obs.kind === "saw-defeat" && obs.note === "player lost");
  if (lostReport) {
    const subjectName = names[lostReport.subject ?? ""] ?? lostReport.subject ?? "them";
    return {
      speakerId: speaker.id,
      listenerId: listener.id,
      speakerLine: `${subjectName} just dropped the new one. Watch yourself.`,
      listenerLine: `Figures. We've all had a turn against ${subjectName}.`,
      observationForListener: {
        kind: "saw-defeat",
        subject: lostReport.subject,
        note: `heard from ${speaker.name}`,
        at: ctx.now,
      },
    };
  }

  const gaveItem = speakerMem.observations.find((obs) => obs.kind === "gave-item");
  if (gaveItem) {
    return {
      speakerId: speaker.id,
      listenerId: listener.id,
      speakerLine: `Got my ${gaveItem.subject} back. Small thing. Made my day.`,
      listenerLine: `Hm. Surprising who's playing errand-runner this week.`,
      observationForListener: { kind: "asked-about", subject: gaveItem.subject, note: `via ${speaker.name}`, at: ctx.now },
    };
  }

  const witnessedPickup = speakerMem.observations.find((obs) => obs.kind === "picked-item");
  if (witnessedPickup) {
    return {
      speakerId: speaker.id,
      listenerId: listener.id,
      speakerLine: `Someone walked off with the ${witnessedPickup.subject}. Hope they meant to.`,
      listenerLine: `If they're moving things, they're moving for a reason.`,
      observationForListener: { kind: "asked-about", subject: witnessedPickup.subject, note: `via ${speaker.name}`, at: ctx.now },
    };
  }

  // No salient memories — generic banter colored by role
  const banter = bantersFor(speaker, listener, listenerMem.talkCount);
  return {
    speakerId: speaker.id,
    listenerId: listener.id,
    speakerLine: banter.speaker,
    listenerLine: banter.listener,
    observationForListener: null,
  };
}

function bantersFor(speaker: CastMember, listener: CastMember, listenerTalkCount: number): { speaker: string; listener: string } {
  const greeted = listenerTalkCount > 0 ? "Quiet day overall." : "Slow morning. Surprised, honestly.";
  const flavorBySpeakerRole: Record<string, { speaker: string; listener: string }> = {
    "Errand hero": {
      speaker: "Did the patrol. Also the laundry.",
      listener: greeted,
    },
    "Cyborg disciple": {
      speaker: "Logged three minor anomalies this hour.",
      listener: "Three? File it as one. Easier paperwork.",
    },
    "Witness hero": {
      speaker: "Nothing to report so far. That's the report.",
      listener: greeted,
    },
    "Ninja rival": {
      speaker: "This street is too quiet. I might fix that.",
      listener: "Try not to fix anything that doesn't need fixing.",
    },
    "Psychic leader": {
      speaker: "The energy in the plaza is fine for once.",
      listener: "Define fine.",
    },
    "Legend": {
      speaker: "...",
      listener: "Right. Same to you.",
    },
    "Master": {
      speaker: "Stance work over reputation, every time.",
      listener: "Footwork over flash. Always.",
    },
    "Backup": {
      speaker: "When does something actually happen here.",
      listener: "When it does, you'll wish it hadn't.",
    },
    "Analyst": {
      speaker: "The clue density in this district is unusual.",
      listener: "Spell it out for me. Slowly.",
    },
    "Rogue martial artist": {
      speaker: "I'm bored. That tends to end badly.",
      listener: "Walk it off.",
    },
  };
  const flavor = flavorBySpeakerRole[speaker.role] ?? {
    speaker: "Patrol's fine. You?",
    listener: greeted,
  };
  // Subtle: listener's role tweaks their response if it's the generic one
  const listenerTweak: Record<string, string> = {
    "Cyborg disciple": "Filed under: not urgent.",
    "Legend": "...",
  };
  return {
    speaker: flavor.speaker,
    listener: listenerTweak[listener.role] ?? flavor.listener,
  };
}
