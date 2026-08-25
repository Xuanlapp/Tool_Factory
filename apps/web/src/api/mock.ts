import type { DashboardData } from './types';

const imageNames = [
  'christmas_2side_4in_qty1.png',
  'pet_memorial_2side_3in_qty2.png',
  'wedding_1side_2in_qty6.png',
  'heart_outline_lazer_3in_qty2.png',
  'xmas_text_lazer_2in_qty4.png',
  'family_photo_2side_3in_qty5.png',
  'cat_love_2side_3in_qty4.png',
  'couple_sunset_2side_4in_qty5.png',
];

export const mockData: DashboardData = {
  source: 'mock',
  summary: {
    capturedAt: new Date().toISOString(),
    runnerStatus: 'running',
    illustratorConnected: true,
    currentFile: 'Acrylic_26_7_01.ai',
    progress: { index: 63, total: 90, state: 'packing', imageBaseName: imageNames[0], message: 'Đang packing Sheet 07', updatedAt: new Date().toISOString(), sourcePath: 'D:/FFactory/Arcylic/Images' },
    kpi: { queue: 48, processing: 1, done: 1326, errors: 0, wait: 2, outputAi: 12, outputFront: 12, outputBack: 8, outputLazer: 12 },
  },
  queue: [],
  sheet: {
    id: '07', status: 'running', placed: 63, total: 90, fitCapInch: 4, remainingFitInch: 3, spacingCm: 0.2, currentWaitFile: 'wait_4.ai', waitDecision: 'Sẽ lưu wait_4.ai',
    items: [],
    waitFiles: [
      { fileName: 'wait_4.ai', updatedAt: '10:15:32', items: 2, fitCapInch: 4, itemList: [
        { id: 'w1', fileName: imageNames[0], sizeInch: 4, side: '2 side', qtyPlaced: 1, qtyRemaining: 0, previewScope: 'wait', previewRelativePath: 'wait_4.ai' },
        { id: 'w2', fileName: imageNames[1], sizeInch: 3, side: '2 side', qtyPlaced: 2, qtyRemaining: 0, previewScope: 'wait', previewRelativePath: 'wait_4.ai' },
      ] },
      { fileName: 'wait_8.ai', updatedAt: '08:57:09', items: 1, fitCapInch: 8, itemList: [
        { id: 'w3', fileName: imageNames[2], sizeInch: 2, side: '1 side', qtyPlaced: 6, qtyRemaining: 0, previewScope: 'wait', previewRelativePath: 'wait_8.ai' },
      ] },
    ],
  },
  done: [],
  processed: [],
  errors: [],
  outputs: [],
  history: [],
  settings: { folders: [], nocodb: { enabled: false, eventsTableConfigured: false, snapshotsTableConfigured: false }, sqlite: 'healthy', illustrator: 'connected', lastCheck: new Date().toISOString() },
};
