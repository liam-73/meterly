// In-memory storage to replace DynamoDB locally

const tables: Record<string, Map<string, any>> = {};

export function createTable(tableName: string) {
  if (!tables[tableName]) {
    tables[tableName] = new Map();
  }
}

export function putItem(tableName: string, item: Record<string, any>) {
  createTable(tableName);
  const key = JSON.stringify(getPrimaryKey(tableName, item));
  tables[tableName].set(key, { ...item });
}

export function getItem(tableName: string, key: Record<string, any>) {
  createTable(tableName);

  // First try direct key lookup
  const keyStr = JSON.stringify(key);
  const direct = tables[tableName].get(keyStr);
  if (direct) return direct;

  // Fall back to scanning for matching attributes (for non-primary key lookups)
  for (const item of tables[tableName].values()) {
    let matches = true;
    for (const [k, v] of Object.entries(key)) {
      if (item[k] !== v) {
        matches = false;
        break;
      }
    }
    if (matches) return item;
  }

  return undefined;
}

export function updateItem(tableName: string, key: Record<string, any>, updates: Record<string, any>) {
  createTable(tableName);
  const keyStr = JSON.stringify(key);
  const existing = tables[tableName].get(keyStr) || key;
  tables[tableName].set(keyStr, { ...existing, ...updates });
}

export function incrementCounter(tableName: string, key: Record<string, any>, attribute: string, inc: number = 1): number {
  createTable(tableName);
  const keyStr = JSON.stringify(key);
  const existing = tables[tableName].get(keyStr) || { ...key, [attribute]: 0 };
  existing[attribute] = (existing[attribute] || 0) + inc;
  tables[tableName].set(keyStr, existing);
  return existing[attribute];
}

export function scanTable(tableName: string) {
  createTable(tableName);
  return Array.from(tables[tableName].values());
}

export function getAllTables() {
  return tables;
}

export function resetAllTables() {
  Object.keys(tables).forEach(key => {
    tables[key].clear();
  });
}

function getPrimaryKey(tableName: string, item: Record<string, any>) {
  const keyMap: Record<string, string> = {
    tenants: 'tenantId',
    apiKeys: 'keyId',
    usage: 'tenantId',
    invoices: 'invoiceId',
    processedEvents: 'eventId',
  };
  const pkField = keyMap[tableName];
  return { [pkField]: item[pkField] };
}
