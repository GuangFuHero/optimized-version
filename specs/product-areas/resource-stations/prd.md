# Resource Stations product definition

## Purpose

Maintain a trustworthy, public directory of disaster-response service and supply locations that remains useful on the map, in operational tables, and in offline field use.

## Actors

- Public contributors suggesting corrections.
- Data Auditors and Super Admin users reviewing and maintaining station data.
- Team users updating time-sensitive operational status and exporting their responsibility area.

## Product boundary

### In scope

- Station information, public visibility, filters/map views, suggestion review, version history, soft deletion/reactivation, operational-status updates, and offline exports.

### Out of scope

- General map drawing and Zone behavior, owned by Map Decision Support.
- Permission definitions, owned by Access Control.

## Core principles

- Map and table views use one station source of truth.
- Public suggestions never overwrite approved data before review.
- Time-sensitive operating status follows a faster path without erasing provenance.
- Deletion preserves station identity and history so a site can reopen.
