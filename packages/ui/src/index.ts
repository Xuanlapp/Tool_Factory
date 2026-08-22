export const dashboardRoutes = ['overview', 'queue', 'sheets', 'done', 'errors', 'outputs', 'history', 'settings'] as const;
export type DashboardRoute = typeof dashboardRoutes[number];
