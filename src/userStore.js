import { randomUUID } from 'node:crypto';

export class EmailTakenError extends Error {}

export function createUserStore() {
  const users = new Map();

  const emailTaken = (email, exceptId) => {
    for (const u of users.values()) {
      if (u.id !== exceptId && u.email === email) return true;
    }
    return false;
  };

  return {
    create({ name, email }) {
      if (emailTaken(email)) throw new EmailTakenError();
      const now = new Date().toISOString();
      const user = { id: randomUUID(), name, email, createdAt: now, updatedAt: now };
      users.set(user.id, user);
      return { ...user };
    },
    get(id) {
      const u = users.get(id);
      return u ? { ...u } : undefined;
    },
    list(limit, offset) {
      return [...users.values()].slice(offset, offset + limit).map((u) => ({ ...u }));
    },
    update(id, fields) {
      const u = users.get(id);
      if (!u) return undefined;
      if (fields.email !== undefined && emailTaken(fields.email, id)) {
        throw new EmailTakenError();
      }
      if (fields.name !== undefined) u.name = fields.name;
      if (fields.email !== undefined) u.email = fields.email;
      u.updatedAt = new Date().toISOString();
      return { ...u };
    },
    remove(id) {
      return users.delete(id);
    },
  };
}
