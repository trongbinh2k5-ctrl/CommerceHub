export enum ReviewStatus {
  VISIBLE = "VISIBLE",
  HIDDEN = "HIDDEN",
  DELETED = "DELETED",
}

export interface ReviewInput {
  rating: number;
  title: string;
  comment: string;
  version?: number;
}

export interface PaginationInput {
  page: number;
  limit: number;
  skip: number;
}
