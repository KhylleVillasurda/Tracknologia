import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock server-only in test environment
vi.mock("server-only", () => ({}));

// Simulates React Server Component per-request cache container (AsyncLocalStorage / React Server Cache)
function createCacheRoot() {
  return new WeakMap();
}
function createCacheNode() {
  return { s: 0, v: void 0, o: null, p: null };
}

let currentRequestCache: Map<() => unknown, unknown> | null = null;

export async function runInServerRequestContext<T>(
  fn: () => Promise<T>,
): Promise<T> {
  const prev = currentRequestCache;
  currentRequestCache = new Map();
  try {
    return await fn();
  } finally {
    currentRequestCache = prev;
  }
}

const { mockGetUser, mockFindMembership } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFindMembership: vi.fn(),
}));

// Mock React.cache to use the React Server Component per-request cache container
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache: (fn: (...args: unknown[]) => unknown) => {
      return function (this: unknown, ...args: unknown[]) {
        if (!currentRequestCache) {
          return fn.apply(this, args);
        }
        let fnMap = currentRequestCache.get(createCacheRoot) as
          WeakMap<object, unknown> | undefined;
        if (!fnMap) {
          fnMap = new WeakMap();
          currentRequestCache.set(createCacheRoot, fnMap);
        }
        let node = fnMap.get(fn as unknown as object) as
          | {
              s: number;
              v: unknown;
              o: WeakMap<object, unknown> | null;
              p: Map<unknown, unknown> | null;
            }
          | undefined;
        if (!node) {
          node = createCacheNode();
          fnMap.set(fn as unknown as object, node);
        }
        for (let i = 0; i < args.length; i++) {
          const arg = args[i];
          if (
            typeof arg === "function" ||
            (typeof arg === "object" && arg !== null)
          ) {
            if (!node.o) node.o = new WeakMap();
            let next = node.o.get(arg as object) as typeof node | undefined;
            if (!next) {
              next = createCacheNode();
              node.o.set(arg as object, next);
            }
            node = next;
          } else {
            if (!node.p) node.p = new Map();
            let next = node.p.get(arg) as typeof node | undefined;
            if (!next) {
              next = createCacheNode();
              node.p.set(arg, next);
            }
            node = next;
          }
        }
        if (node.s === 1) return node.v;
        if (node.s === 2) throw node.v;
        try {
          const res = fn.apply(this, args);
          node.s = 1;
          return (node.v = res);
        } catch (err) {
          node.s = 2;
          node.v = err;
          throw err;
        }
      };
    },
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockImplementation(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
    }),
  ),
}));

vi.mock("@/features/auth/persistence", () => ({
  findMembershipByUserId: (...args: unknown[]) => mockFindMembership(...args),
}));

import {
  getUser,
  requireUser,
  getProviderContext,
  requireProviderContext,
  requireProviderRole,
} from "@/features/auth/context";

describe("Auth Module — Request-Local Deduplication & Freshness Contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deduplicates underlying auth.getUser and findMembershipByUserId calls within a single server request", async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "user-owner-1",
          email: "owner@shop.com",
          user_metadata: {
            display_name: "Apex Electronics",
            provider_type: "SHOP",
          },
        },
      },
      error: null,
    });

    mockFindMembership.mockResolvedValue({
      id: "mem-1",
      providerId: "prov-1",
      userId: "user-owner-1",
      role: "OWNER",
      providerName: "Apex Electronics",
      providerType: "SHOP",
      createdAt: new Date().toISOString(),
    });

    await runInServerRequestContext(async () => {
      // In a representative Server Component request pipeline without injected clients:
      // 1. Dashboard Layout checks role authorization
      const roleContext = await requireProviderRole(["OWNER"]);
      expect(roleContext.providerId).toBe("prov-1");
      expect(roleContext.role).toBe("OWNER");

      // 2. Dashboard Page resolves provider context
      const pageContext = await getProviderContext();
      expect(pageContext?.providerId).toBe("prov-1");

      // 3. Header / Navigation requires provider context
      const requiredContext = await requireProviderContext();
      expect(requiredContext.providerId).toBe("prov-1");

      // 4. User profile component requires authenticated user
      const reqUser = await requireUser();
      expect(reqUser.id).toBe("user-owner-1");

      // 5. Child component resolves user
      const user = await getUser();
      expect(user?.id).toBe("user-owner-1");

      // Assert that despite 5 consumers in the request pipeline, underlying operations ran exactly once
      expect(mockGetUser).toHaveBeenCalledTimes(1);
      expect(mockFindMembership).toHaveBeenCalledTimes(1);
    });
  });

  it("ensures subsequent request evaluates membership fresh without cross-request stale cache", async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "user-staff-1",
          email: "staff@shop.com",
        },
      },
      error: null,
    });

    let currentMembership: unknown = {
      id: "mem-2",
      providerId: "prov-1",
      userId: "user-staff-1",
      role: "STAFF",
      providerName: "Apex Electronics",
      providerType: "SHOP",
      createdAt: new Date().toISOString(),
    };

    mockFindMembership.mockImplementation(() =>
      Promise.resolve(currentMembership),
    );

    // --- Request 1 (Staff active in database) ---
    await runInServerRequestContext(async () => {
      const contextReq1 = await requireProviderContext();
      expect(contextReq1.role).toBe("STAFF");
      expect(mockGetUser).toHaveBeenCalledTimes(1);
      expect(mockFindMembership).toHaveBeenCalledTimes(1);
    });

    // Staff is offboarded in database before Request 2
    currentMembership = null;
    mockGetUser.mockClear();
    mockFindMembership.mockClear();

    // --- Request 2 (New server request lifecycle) ---
    // Fresh request lifecycle must evaluate membership against database and not use stale cached context
    await runInServerRequestContext(async () => {
      await expect(requireProviderContext()).rejects.toMatchObject({
        code: "NO_MEMBERSHIP",
        name: "AuthError",
      });
      expect(mockGetUser).toHaveBeenCalledTimes(1);
      expect(mockFindMembership).toHaveBeenCalledTimes(1);
    });
  });
});
