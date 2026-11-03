// "Getting started" (2026-11-03): six small hands-on tasks. Each one is done on the REAL screen with one to three
// clicks — no typing — and a step only moves on when the app sees it was done (a page opened, audio played, a popup
// appeared). The words are kept short on purpose: doing teaches, reading does not.
//
// Targets are found on the live page (GuideProvider.findTarget):
//   'css selector' | { title: 'starts with this title' } | { text: 'visible label' } — or a list, first one found.
// `advance`: 'click' (the target is clicked) | /route/ (the app reaches that page) | () => boolean (polled).
// A step with no advance shows a "Done"/"Next" button (used only for the last word of a task).
import type { ReactNode } from 'react';

export type TourTarget = string | { title: string } | { text: string; within?: string };

export interface TourStep {
  title: string;
  body: ReactNode;
  target?: TourTarget | TourTarget[];
  route?: RegExp;
  goTo?: string;
  advance?: 'click' | RegExp | (() => boolean);
  /** The prompt while waiting for the user. */
  doIt?: string;
  tip?: string;
  optional?: boolean;
}

export interface Tour {
  id: string;
  title: string;
  summary: string;
  steps: TourStep[];
  /** Needs an open report: when no transcript is on screen, OPEN_A_REPORT runs first. */
  needsReport?: boolean;
}

/** Prepended to a report task when no report is open (GuideProvider.startTour). */
export const OPEN_A_REPORT: TourStep = {
  title: 'First, open a report',
  body: <p>Click {'Try Sample Data'} on the Dashboard — or any recording in the sidebar.</p>,
  target: [{ text: 'Try Sample Data' }, '[data-tour="recordings-list"]'],
  route: /^\/$/, goTo: '/',
  advance: /^\/(report\/|sample)/,
  doIt: 'Open one to continue.',
};

const REPORT = /^\/(report\/|sample)/;
const b = (s: string) => <strong className="text-gray-900">{s}</strong>;
const audioPlaying = () => [...document.querySelectorAll('audio')].some((a) => !a.paused && a.currentTime > 0);
const has = (sel: string) => () => !!document.querySelector(sel);

export const TOURS: Tour[] = [
  {
    id: 'open-sample',
    title: 'Open a report',
    summary: 'See what SATE makes from a recording.',
    steps: [
      {
        title: 'Open a report',
        body: <p>Click {b('Try Sample Data')} — or any recording in the sidebar — to open a report.</p>,
        target: [{ text: 'Try Sample Data' }, '[data-tour="recordings-list"]'],
        route: /^\/$/, goTo: '/',
        advance: REPORT,
        doIt: 'Click it to continue.',
      },
      {
        title: 'This is a report',
        body: <p>The transcript is in the middle, the analysis on the right, the player at the bottom.</p>,
        target: '[data-tour="transcript"]', route: REPORT,
      },
    ],
  },
  {
    id: 'listen', needsReport: true,
    title: 'Listen to a word',
    summary: 'Every word is linked to the audio.',
    steps: [
      {
        title: 'Click any word',
        body: <p>Click a word in the transcript — SATE plays from that word to the end of the line.</p>,
        target: '[data-tour="word"]', route: REPORT, advance: audioPlaying,
        doIt: 'Click a word to continue.',
        tip: 'Double-click a word to hear just that word.',
      },
    ],
  },
  {
    id: 'annotation', needsReport: true,
    title: 'Look at an annotation',
    summary: 'Fillers, repetitions, pauses… marked on the words.',
    steps: [
      {
        title: 'Click a highlighted word',
        body: <p>Coloured words are annotations. Click one to see what it is.</p>,
        target: '[data-tour="word-annotated"]', route: REPORT, advance: has('[data-track="Annotation: play"]'),
        doIt: 'Click a highlighted word to continue.',
      },
      {
        title: 'Play it',
        body: <p>Press {b('Play')} in the box to hear it.</p>,
        target: '[data-track="Annotation: play"]', route: REPORT, advance: audioPlaying, optional: true,
        doIt: 'Click Play to finish.',
      },
    ],
  },
  {
    id: 'edit', needsReport: true,
    title: 'Try edit mode',
    summary: 'Fix the transcript — nothing is saved in this try.',
    steps: [
      {
        title: 'Click Edit',
        body: <p>{b('Edit')} lets you fix words, speakers and notes.</p>,
        target: { title: 'Enable edit mode' }, route: REPORT, advance: has('[title="Cancel editing"]'),
        doIt: 'Click Edit to continue.',
      },
      {
        title: 'Now click Cancel',
        body: <p>In edit mode you double-click a line to change it, then {b('Save')}. For now, click {b('Cancel')} — nothing is saved.</p>,
        target: { title: 'Cancel editing' }, route: REPORT, advance: has('[title="Enable edit mode"]'),
        doIt: 'Click Cancel to finish.',
      },
    ],
  },
  {
    id: 'sate-report', needsReport: true,
    title: 'Open the SATE Report',
    summary: 'The clinical report you export as PDF or Word.',
    steps: [
      {
        title: 'Click SATE Report',
        body: <p>The {b('SATE Report')} turns this transcript into a clinical language-sample report.</p>,
        target: { title: 'Generate a SATE clinical report' }, route: REPORT, advance: has('[data-tour="sate-report"]'),
        doIt: 'Click SATE Report to finish.',
        tip: 'Close it with the × when you have had a look.',
      },
    ],
  },
  {
    id: 'upload',
    title: 'Start an upload',
    summary: 'Where your own recordings go in.',
    steps: [
      {
        title: 'Click New Recording',
        body: <p>Every report starts here.</p>,
        target: { text: 'New Recording' }, route: /^\/$/, goTo: '/', advance: has('[data-tour="assign-patient"]'),
        doIt: 'Click New Recording to continue.',
      },
      {
        title: 'Pick a patient, then Next',
        body: <p>Choose the patient — or {b('No Patient (Standalone)')} — and click {b('Next →')}.</p>,
        target: { text: 'Next →' }, advance: has('[data-tour="dropzone"]'),
        doIt: 'Click Next → to continue.',
      },
      {
        title: 'Drop your audio here',
        body: <>
          <p>WAV, MP3, M4A (iPhone), FLAC, OGG or AAC. Videos and damaged files are refused right away.</p>
          <p>Then give it a name and {b('Save')} — the report opens and fills in by itself.</p>
        </>,
        target: '[data-tour="dropzone"]',
        tip: 'Close this window if you don’t have a file ready — you can come back any time.',
      },
    ],
  },
];
