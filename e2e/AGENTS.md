# Human-owned end-to-end tests

The files in this directory are human-owned acceptance tests. Agents may run them
through `scripts/run-e2e.sh`, but must not edit, delete, rename, or regenerate
them. The hash manifest is checked before and after every run; a human must
review and update it when an intentional test change is made.
