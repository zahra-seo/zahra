/**
 * Minimal GitHub REST client — pure fetch, no SDK dependency.
 * Scope: exactly what the PR execution channel needs (§6.2 of the spec).
 */

export interface GitHubRepoRef {
  owner: string;
  repo: string;
}

export interface PullRequestInfo {
  number: number;
  url: string;
  state: 'open' | 'closed';
  merged: boolean;
  headSha: string;
}

export class GitHubError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export class GitHubClient {
  constructor(
    private readonly token: string,
    private readonly baseUrl = 'https://api.github.com',
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'zahra-seo',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new GitHubError(`GitHub ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`, res.status);
    }
    return (await res.json()) as T;
  }

  async getDefaultBranch(ref: GitHubRepoRef): Promise<string> {
    const repo = await this.request<{ default_branch: string }>('GET', `/repos/${ref.owner}/${ref.repo}`);
    return repo.default_branch;
  }

  async getBranchSha(ref: GitHubRepoRef, branch: string): Promise<string> {
    const data = await this.request<{ object: { sha: string } }>(
      'GET',
      `/repos/${ref.owner}/${ref.repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    );
    return data.object.sha;
  }

  async createBranch(ref: GitHubRepoRef, branch: string, fromSha: string): Promise<void> {
    await this.request('POST', `/repos/${ref.owner}/${ref.repo}/git/refs`, {
      ref: `refs/heads/${branch}`,
      sha: fromSha,
    });
  }

  /** Returns null when the file does not exist on that branch. */
  async getFile(
    ref: GitHubRepoRef,
    path: string,
    branch: string,
  ): Promise<{ content: string; sha: string } | null> {
    try {
      const data = await this.request<{ content: string; sha: string; encoding: string }>(
        'GET',
        `/repos/${ref.owner}/${ref.repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`,
      );
      return { content: Buffer.from(data.content, 'base64').toString('utf8'), sha: data.sha };
    } catch (err) {
      if (err instanceof GitHubError && err.status === 404) return null;
      throw err;
    }
  }

  async putFile(
    ref: GitHubRepoRef,
    path: string,
    branch: string,
    content: string,
    message: string,
    existingSha?: string,
  ): Promise<{ commitSha: string }> {
    const data = await this.request<{ commit: { sha: string } }>(
      'PUT',
      `/repos/${ref.owner}/${ref.repo}/contents/${encodePath(path)}`,
      {
        message,
        branch,
        content: Buffer.from(content, 'utf8').toString('base64'),
        ...(existingSha ? { sha: existingSha } : {}),
      },
    );
    return { commitSha: data.commit.sha };
  }

  async openPullRequest(
    ref: GitHubRepoRef,
    params: { title: string; body: string; head: string; base: string },
  ): Promise<PullRequestInfo> {
    const pr = await this.request<{ number: number; html_url: string; head: { sha: string } }>(
      'POST',
      `/repos/${ref.owner}/${ref.repo}/pulls`,
      params,
    );
    return { number: pr.number, url: pr.html_url, state: 'open', merged: false, headSha: pr.head.sha };
  }

  async getPullRequest(ref: GitHubRepoRef, number: number): Promise<PullRequestInfo> {
    const pr = await this.request<{
      number: number;
      html_url: string;
      state: 'open' | 'closed';
      merged: boolean;
      head: { sha: string };
    }>('GET', `/repos/${ref.owner}/${ref.repo}/pulls/${number}`);
    return { number: pr.number, url: pr.html_url, state: pr.state, merged: pr.merged, headSha: pr.head.sha };
  }

  async closePullRequest(ref: GitHubRepoRef, number: number): Promise<void> {
    await this.request('PATCH', `/repos/${ref.owner}/${ref.repo}/pulls/${number}`, { state: 'closed' });
  }
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}
