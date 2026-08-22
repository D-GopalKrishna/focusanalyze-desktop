import { DailyReport, DailyReportApi, MonthlyReport, WeeklyReport } from "@shared/api-client";
import { createApiClient } from '../auth';

const api = createApiClient(DailyReportApi);

async function getDailyReport(date: string): Promise<DailyReport> {
  const { data } = await api.apiDailyReportGetDailyReportRetrieve(date);
  return data;
}

async function getDailyReportsInRange(startTime: string, endTime: string): Promise<DailyReport[]> {
  const { data } = await api.apiDailyReportGetDailyReportByTimeRangeRetrieve(endTime, startTime);
  return Array.isArray(data) ? data : [];
}

async function generateDailyReport(date: string, notify = true): Promise<DailyReport> {
  const { data } = await api.apiDailyReportGenerateDailyReportCreate(
    date,
    { date } as DailyReport,
    notify,
  );
  return data;
}

async function getWeeklyReport(date: string): Promise<WeeklyReport> {
  const { data } = await api.apiDailyReportGetWeeklyReportRetrieve(date);
  return data;
}

async function generateWeeklyReport(date: string, notify = true): Promise<WeeklyReport> {
  const { data } = await api.apiDailyReportGenerateWeeklyReportCreate(
    date,
    { week_start: date } as unknown as DailyReport,
    notify,
  );
  return data;
}

async function getMonthlyReport(date: string): Promise<MonthlyReport> {
  const { data } = await api.apiDailyReportGetMonthlyReportRetrieve(date);
  return data;
}

async function generateMonthlyReport(date: string, notify = false): Promise<MonthlyReport> {
  const { data } = await api.apiDailyReportGenerateMonthlyReportCreate(
    date,
    { date } as DailyReport,
    notify,
  );
  return data;
}

export {
  getDailyReport,
  getDailyReportsInRange,
  generateDailyReport,
  getWeeklyReport,
  generateWeeklyReport,
  getMonthlyReport,
  generateMonthlyReport,
};
