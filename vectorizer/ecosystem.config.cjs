module.exports = {
  apps: [
    {
      name: "ndbf-vectorizer",
      script: "worker.js",
      cwd: "/opt/ndbf-vectorizer",
      node_args: "--env-file=/opt/ndbf/.env",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      time: true,
    },
  ],
};
