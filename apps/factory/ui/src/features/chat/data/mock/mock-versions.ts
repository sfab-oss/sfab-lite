import type { AppVersion } from "../../model/types";

export const MOCK_VERSIONS: AppVersion[] = [
  {
    id: "ver_live",
    label: "v12",
    createdAt: "2h ago",
    live: true,
  },
  {
    id: "ver_11",
    label: "v11",
    createdAt: "1d ago",
    live: false,
  },
  {
    id: "ver_10",
    label: "v10",
    createdAt: "4d ago",
    live: false,
  },
  {
    id: "ver_9",
    label: "v9",
    createdAt: "1w ago",
    live: false,
  },
];
