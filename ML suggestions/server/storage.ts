```typescript
import {
  users,
  items,
  swaps,
  donations,
  aiSuggestions,
  type User,
  type UpsertUser,
  type Item,
  type InsertItem,
  type Swap,
  type InsertSwap,
  type Donation,
  type InsertDonation,
  type AISuggestion,
} from "@shared/schema";
import { customAlphabet } from "nanoid";
import { db } from "./db";
import { eq, and, or } from "drizzle-orm";
import { calculatePointsValue } from "./utils";

const nanoid = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', 21);

export interface IStorage {
  // User operations - mandatory for Replit Auth
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserPoints(userId: string, points: number): Promise<void>;
  
  // Item operations
  createItem(item: InsertItem): Promise<Item>;
  getItem(id: string): Promise<Item | undefined>;
  getUserItems(userId: string): Promise<Item[]>;
  getFeaturedItems(): Promise<Item[]>;
  getAllItems(filters?: { category?: string; type?: string; status?: string }): Promise<Item[]>;
  updateItem(id: string, updates: Partial<Item>): Promise<Item>;
  deleteItem(id: string): Promise<void>;
  
  // Swap operations
  createSwap(swap: InsertSwap): Promise<Swap>;
  getUserSwaps(userId: string): Promise<Swap[]>;
  updateSwap(id: string, updates: Partial<Swap>): Promise<Swap>;
  
  // Donation operations
  createDonation(donation: InsertDonation): Promise<Donation>;
  getUserDonations(userId: string): Promise<Donation[]>;
  
  // AI Suggestions
  createAISuggestion(suggestion: Omit<AISuggestion, 'id' | 'createdAt'>): Promise<AISuggestion>;
  getAISuggestions(userId: string): Promise<AISuggestion[]>;
}

export class DatabaseStorage implements IStorage {
  // User operations - mandatory for Replit Auth
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
     .insert(users)
     .values({
       ...userData,
        points: userData.points?? 5, // New users get 5 points
        updatedAt: new Date(),
      })
     .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
     .returning();
    return user;
  }

  async updateUserPoints(userId: string, points: number): Promise<void> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (user) {
      await db
       .update(users)
        .set({
          points: (user.points || 0) + points,
          updatedAt: new Date(),
        })
       .where(eq(users.id, userId));
    }
  }

  // Item operations
  async createItem(itemData: InsertItem): Promise<Item> {
    const id = nanoid();
    const [item] = await db
     .insert(items)
     .values({
       ...itemData,
        id,
        pointsValue: calculatePointsValue(itemData),
        status: itemData.status?? 'approved',
        updatedAt: new Date(),
      })
     .returning();
    
    // Award points for listing
    if (item.userId) {
      await this.updateUserPoints(item.userId, 10);
    }
    
    return item;
  }

  async getItem(id: string): Promise<Item | undefined> {
    const [item] = await db.select().from(items).where(eq(items.id, id));
    return item;
  }

  async getUserItems(userId: string): Promise<Item[]> {
    return await db.select().from(items).where(eq(items.userId, userId));
  }

  async getFeaturedItems(): Promise<Item[]> {
    return await db
     .select()
     .from(items)
     .where(and(eq(items.isFeatured, true), eq(items.status, 'approved')))
     .limit(8);
  }

  async getAllItems(filters?: { category?: string; type?: string; status?: string }): Promise<Item[]> {
    let query = db.select().from(items);
    
    if (filters) {
      const conditions = [];
      if (filters.category) {
        conditions.push(eq(items.category, filters.category));
      }
      if (filters.type) {
        conditions.push(eq(items.type, filters.type));
      }
      if (filters.status) {
        conditions.push(eq(items.status, filters.status));
      }
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }
    }
    
    return await query.orderBy(items.createdAt);
  }

  async updateItem(id: string, updates: Partial<Item>): Promise<Item> {
    const [item] = await db
     .update(items)
     .set({
       ...updates,
        updatedAt: new Date(),
      })
     .where(eq(items.id, id))
     .returning();
    
    if (!item) {
      throw new Error('Item not found');
    }
    
    return item;
  }

  async deleteItem(id: string): Promise<void> {
    await db.delete(items).where(eq(items.id, id));
  }

  // Swap operations
  async createSwap(swapData: InsertSwap): Promise<Swap> {
    const id = nanoid();
    const [swap] = await db
     .insert(swaps)
     .values({
       ...swapData,
        id,
        status: swapData.status?? 'pending',
        updatedAt: new Date(),
      })
     .returning();
    
    return swap;
  }

  async getUserSwaps(userId: string): Promise<Swap[]> {
    return await db
     .select()
     .from(swaps)
     .where(or(eq(swaps.requesterId, userId), eq(swaps.ownerId, userId)))
      .orderBy(swaps.createdAt);
  }

  async updateSwap(id: string, updates: Partial<Swap>): Promise<Swap> {
    const [existingSwap] = await db.select().from(swaps).where(eq(swaps.id, id));
    
    const [swap] = await db
     .update(swaps)
     .set({
       ...updates,
        updatedAt: new Date(),
      })
     .where(eq(swaps.id, id))
     .returning();
    
    if (!swap) {
      throw new Error('Swap not found');
    }
    
    // Award points for completed swaps
    if (swap.status === 'completed' && existingSwap?.status!== 'completed') {
      if (swap.requesterId) {
        await this.updateUserPoints(swap.requesterId, 20);
      }
      if (swap.ownerId) {
        await this.updateUserPoints(swap.ownerId, 20);
      }
    }
    
    return swap;
  }

  // Donation operations
  async createDonation(donationData: InsertDonation): Promise<Donation> {
    const id = nanoid();
    const [donation] = await db
     .insert(donations)
     .values({
       ...donationData,
        id,
      })
     .returning();
    
    // Award points for donation
    if (donation.donorId) {
      await this.updateUserPoints(donation.donorId, 20);
    }
    
    return donation;
  }

  async getUserDonations(userId: string): Promise<Donation[]> {
    return await db
     .select()
     .from(donations)
     .where(eq(donations.donorId, userId))
     .orderBy(donations.createdAt);
  }

  // AI Suggestions
  async createAISuggestion(suggestionData: Omit<AISuggestion, 'id' | 'createdAt'>): Promise<AISuggestion> {
    const id = nanoid();
    const [suggestion] = await db
     .insert(aiSuggestions)
     .values({
       ...suggestionData,
        id,
      })
     .returning();
    
    return suggestion;
  }

  async getAISuggestions(userId: string): Promise<AISuggestion[]> {
    return await db
     .select()
     .from(aiSuggestions)
     .where(eq(aiSuggestions.userId, userId))
     .orderBy(aiSuggestions.createdAt)
     .limit(10);
  }
}

export const storage = new DatabaseStorage();
```