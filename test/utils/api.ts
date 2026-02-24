export type EmployeeInput = {
  email: string;
  firstName: string;
  lastName: string;
  currentAgency: string;
};

export type InspectorInput = {
  email: string;
  firstName: string;
  lastName: string;
  currentAgency: string;
};

export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly authorization?: string,
  ) {}

  private async request<T>(
    path: string,
    init?: RequestInit,
  ): Promise<T> {
    const response = await fetch(new URL(path, this.baseUrl), {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(this.authorization
          ? { Authorization: this.authorization }
          : {}),
        ...(init?.headers ?? {}),
      },
    });

    const contentType = response.headers.get("content-type") ?? "";
    const isJson = contentType.includes("application/json");
    const body = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      throw new Error(
        `API ${response.status} ${response.statusText} on ${path}: ${
          typeof body === "string" ? body : JSON.stringify(body)
        }`,
      );
    }

    return body as T;
  }

  async createEmployee(payload: EmployeeInput) {
    return this.request("/employee", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async getEmployees(currentAgency: string) {
    return this.request(`/employee?groupName=${encodeURIComponent(currentAgency)}`);
  }

  async deleteEmployee(username: string) {
    return this.request(`/employee/${encodeURIComponent(username)}`, {
      method: "DELETE",
    });
  }

  async createInspector(payload: InspectorInput) {
    return this.request("/inspector", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async getInspectors(currentAgency: string) {
    return this.request(
      `/inspector?groupName=${encodeURIComponent(currentAgency)}`,
    );
  }

  async deleteInspector(username: string) {
    return this.request(`/inspector/${encodeURIComponent(username)}`, {
      method: "DELETE",
    });
  }
}
