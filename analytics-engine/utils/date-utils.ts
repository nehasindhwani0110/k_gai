/**
 * Date utility functions for parsing and formatting dates in queries
 */

/**
 * Parses a date string into a Date object
 * Supports multiple date formats
 */
export function parseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr || dateStr === '' || dateStr === 'NULL' || dateStr === 'null') {
    return null;
  }

  const str = String(dateStr).trim();
  
  // Try ISO format (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const date = new Date(str);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  // Try MM/DD/YYYY format
  if (/^\d{2}\/\d{2}\/\d{4}/.test(str)) {
    const parts = str.split('/');
    const date = new Date(`${parts[2]}-${parts[0]}-${parts[1]}`);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  // Try DD-MM-YYYY format
  if (/^\d{2}-\d{2}-\d{4}/.test(str)) {
    const parts = str.split('-');
    const date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  // Try generic Date parsing
  const date = new Date(str);
  if (!isNaN(date.getTime())) {
    return date;
  }
  
  return null;
}

/**
 * Checks if a value is a date
 */
export function isDate(value: any): boolean {
  if (!value) return false;
  const str = String(value).trim();
  return parseDate(str) !== null;
}

/**
 * Extracts year from a date
 */
export function extractYear(dateStr: string | null | undefined): number | null {
  const date = parseDate(dateStr);
  if (!date) return null;
  return date.getFullYear();
}

/**
 * Extracts month from a date (1-12)
 */
export function extractMonth(dateStr: string | null | undefined): number | null {
  const date = parseDate(dateStr);
  if (!date) return null;
  return date.getMonth() + 1; // JavaScript months are 0-indexed
}

/**
 * Extracts day from a date
 */
export function extractDay(dateStr: string | null | undefined): number | null {
  const date = parseDate(dateStr);
  if (!date) return null;
  return date.getDate();
}

/**
 * Formats date to YYYY-MM-DD
 */
export function formatDate(date: Date | null): string | null {
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats date to readable format (e.g., "Jan 2024")
 */
export function formatDateReadable(date: Date | null): string | null {
  if (!date) return null;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Extracts date part from a date string (removes time component)
 */
export function extractDate(dateStr: string | null | undefined): string | null {
  const date = parseDate(dateStr);
  if (!date) return null;
  return formatDate(date);
}

/**
 * Groups date by year-month for time series queries
 */
export function getYearMonth(dateStr: string | null | undefined): string | null {
  const date = parseDate(dateStr);
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Groups date by year for time series queries
 */
export function getYear(dateStr: string | null | undefined): string | null {
  const date = parseDate(dateStr);
  if (!date) return null;
  return String(date.getFullYear());
}

