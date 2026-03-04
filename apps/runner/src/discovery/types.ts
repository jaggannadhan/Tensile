export interface QueueItem {
  url: string;
  depth: number;
  discoveredFrom: string;
}

export interface CrawlState {
  visited: Set<string>;
  queue: QueueItem[];
  pagesDiscovered: number;
  linksFound: number;
  blockedNavigations: number;
}
