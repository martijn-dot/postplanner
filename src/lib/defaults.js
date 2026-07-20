const PRODUCTION_LABEL_NAMES = new Set([
  'Prep', 'Pre-light', 'Shoot', 'Strike', 'Travel',
  'Schedule', 'Book crew', 'Confirm talent', 'Location check', 'Call sheet',
]);

export const DEFAULT_LABELS = [
  { column_type: 'who', value: 'Wenneker', color: '#28b8ff', is_default: true },
  { column_type: 'who', value: 'Client', color: '#ffcf5c', is_default: true },
  { column_type: 'who', value: 'Agency', color: '#8d79ff', is_default: true },
  { column_type: 'what', value: 'Offline V1', color: '#ffd166', is_default: true },
  { column_type: 'what', value: 'Offline V2', color: '#ffd166', is_default: true },
  { column_type: 'what', value: 'Offline V3', color: '#ffd166', is_default: true },
  { column_type: 'what', value: 'Offline Final', color: '#ffd166', is_default: true },
  { column_type: 'what', value: 'Offline Lock', color: '#b793ff', is_default: true },
  { column_type: 'what', value: 'PreFinal', color: '#54c7ff', is_default: true },
  { column_type: 'what', value: 'PreFinal V1', color: '#54c7ff', is_default: true },
  { column_type: 'what', value: 'PreFinal V2', color: '#54c7ff', is_default: true },
  { column_type: 'what', value: 'Final', color: '#ff5e84', is_default: true },
  { column_type: 'what', value: 'Final Delivery', color: '#46d39b', is_default: true },
  { column_type: 'what', value: 'Grading', color: '#8b8f9a', is_default: true },
  { column_type: 'what', value: 'Audio', color: '#8b8f9a', is_default: true },
  { column_type: 'what', value: '360 V1', color: '#9a6a43', is_default: true },
  { column_type: 'what', value: '360 V2', color: '#9a6a43', is_default: true },
  { column_type: 'what', value: 'CGI WIP V1', color: '#ff8f4f', is_default: true },
  { column_type: 'what', value: 'CGI WIP V2', color: '#ff8f4f', is_default: true },
  { column_type: 'what', value: 'CGI WIP V3', color: '#ff8f4f', is_default: true },
  { column_type: 'what', value: 'CGI Lock', color: '#b793ff', is_default: true },
  { column_type: 'what', value: 'DesignV1', color: '#f45fd2', is_default: true },
  { column_type: 'what', value: 'Design V2', color: '#f45fd2', is_default: true },
  { column_type: 'what', value: 'Design V3', color: '#f45fd2', is_default: true },
  { column_type: 'what', value: 'Photography V1', color: '#ffd166', is_default: true },
  { column_type: 'what', value: 'Photography V2', color: '#ffd166', is_default: true },
  { column_type: 'what', value: 'Creative V1', color: '#b793ff', is_default: true },
  { column_type: 'what', value: 'Creative V2', color: '#b793ff', is_default: true },
  { column_type: 'what', value: 'CAD/MUS/PGD', color: '#8b8f9a', is_default: true },
  { column_type: 'what', value: 'CIMA', color: '#8b8f9a', is_default: true },
  { column_type: 'what', value: 'Shoot', color: '#8b8f9a', is_default: true },
  { column_type: 'what', value: 'Prep', color: '#28b8ff', is_default: true },
  { column_type: 'what', value: 'Pre-light', color: '#8d79ff', is_default: true },
  { column_type: 'what', value: 'Strike', color: '#ff8f4f', is_default: true },
  { column_type: 'what', value: 'Travel', color: '#10b981', is_default: true },
  { column_type: 'todo', value: 'Share', color: '#46d39b', is_default: true },
  { column_type: 'todo', value: 'Viewing at Wenneker', color: '#46d39b', is_default: true },
  { column_type: 'todo', value: 'Session at Wenneker', color: '#46d39b', is_default: true },
  { column_type: 'todo', value: 'Viewing online', color: '#46d39b', is_default: true },
  { column_type: 'todo', value: 'Share Feedback', color: '#54c7ff', is_default: true },
  { column_type: 'todo', value: 'Approval', color: '#b793ff', is_default: true },
  { column_type: 'todo', value: 'Internal', color: '#8b8f9a', is_default: true },
  { column_type: 'todo', value: 'Upload PAL & EG+', color: '#ff5e84', is_default: true },
  { column_type: 'todo', value: 'Upload DAM', color: '#ff5e84', is_default: true },
  { column_type: 'todo', value: 'Upload SAL', color: '#ff5e84', is_default: true },
  { column_type: 'todo', value: 'Schedule', color: '#46d39b', is_default: true },
  { column_type: 'todo', value: 'Book crew', color: '#28b8ff', is_default: true },
  { column_type: 'todo', value: 'Confirm talent', color: '#b793ff', is_default: true },
  { column_type: 'todo', value: 'Location check', color: '#f59e0b', is_default: true },
  { column_type: 'todo', value: 'Call sheet', color: '#ff8f4f', is_default: true },
].map((label) => ({
  ...label,
  planning_type: label.column_type === 'who'
    ? 'both'
    : (PRODUCTION_LABEL_NAMES.has(label.value) ? 'production' : 'post'),
}));

export const DEFAULT_PROJECT = {
  name: 'Timeline Planning',
  client: 'Demo client',
};

export const DEFAULT_PLANNING_WHAT_LABELS = [
  'Offline V1',
  'Offline V2',
  'Offline Final',
  'PreFinal V1',
  'PreFinal V2',
  'Final',
  'Final Delivery',
];

export const PLANNING_TYPES = {
  post: {
    key: 'post',
    label: 'Post Production',
    shortLabel: 'Post',
    defaultCategoryName: 'Post Production Planning',
    whatLabel: 'What',
    assetLabel: 'Asset',
    showWhatSelector: true,
  },
  production: {
    key: 'production',
    label: 'Production',
    shortLabel: 'Production',
    defaultCategoryName: 'Production Planning',
    whatLabel: 'What',
    assetLabel: 'What',
    showWhatSelector: false,
  },
};

export const DEFAULT_PLANNING_TYPE = PLANNING_TYPES.post.key;

export const PRODUCTION_WHAT_LABELS = [
  'Prep',
  'Pre-light',
  'Shoot',
  'Strike',
  'Travel',
];

export const PRODUCTION_TODO_LABELS = [
  'Schedule',
  'Book crew',
  'Confirm talent',
  'Location check',
  'Call sheet',
  'Approval',
];

export const DEFAULT_PLANNING_ALIASES = {
  finals: ['finals', 'final'],
};
