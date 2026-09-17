import type { AgentDriver } from "../types.js";

export class DriverRegistry {
  private drivers = new Map<string, AgentDriver>();

  public register(driver: AgentDriver): void {
    this.drivers.set(driver.name.toLowerCase(), driver);
  }

  public get(name: string): AgentDriver | undefined {
    return this.drivers.get(name.toLowerCase());
  }

  public list(): AgentDriver[] {
    return Array.from(this.drivers.values());
  }

  public async detectAvailable(): Promise<
    Array<{ driver: AgentDriver; status: { available: boolean; reason?: string; version?: string } }>
  > {
    const results = [];
    for (const driver of this.drivers.values()) {
      const status = await driver.isAvailable();
      results.push({ driver, status });
    }
    return results;
  }
}

// Global shared registry instance
export const globalDriverRegistry = new DriverRegistry();
