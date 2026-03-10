# Photo Grouping — Data Sources & Derivation

> **Related specs:** [grouping-dropdown](../element-specs/grouping-dropdown.md), [workspace-view-system](../element-specs/workspace-view-system.md), [workspace-toolbar](../element-specs/workspace-toolbar.md)
> **Related use cases:** [workspace-view WV-4, WV-5](workspace-view.md)

---

## Overview

Photos can be grouped by various properties. Some properties are stored directly on each image row, some are derived from other fields at query time or on the client, and some require external resolution (reverse geocoding). This document maps every grouping property to its data source, derivation logic, and fallback behaviour.

---

## Grouping Property Matrix

| Property     | DB Column(s)              | Source                     | Derivation                                      | Fallback Label       |
| ------------ | ------------------------- | -------------------------- | ----------------------------------------------- | -------------------- |
| **Date**     | `captured_at`             | EXIF extraction at upload  | `toLocaleDateString(full)`                      | `"Unknown date"`     |
| **Year**     | `captured_at`             | EXIF extraction at upload  | `getFullYear()`                                 | `"Unknown year"`     |
| **Month**    | `captured_at`             | EXIF extraction at upload  | `toLocaleDateString(year+month)` → "March 2026" | `"Unknown month"`    |
| **Project**  | `project_id` → `projects` | User assignment at upload  | JOIN project name                               | `"No project"`       |
| **City**     | `city`                    | Reverse geocoding from GPS | Stored directly after address resolution        | `"Unknown city"`     |
| **Country**  | `country`                 | Reverse geocoding from GPS | Stored directly after address resolution        | `"Unknown country"`  |
| **Street**   | `street`                  | Reverse geocoding from GPS | Stored directly after address resolution        | `"Unknown street"`   |
| **District** | `district`                | Reverse geocoding from GPS | Stored directly after address resolution        | `"Unknown district"` |
| **Address**  | `address_label`           | Reverse geocoding / manual | Full human-readable label                       | `"Unknown address"`  |
| **User**     | `user_id` → `profiles`    | Auth at upload             | JOIN profile full_name                          | `"Unknown user"`     |

---

## Data Flow: How Address Fields Get Populated

```mermaid
flowchart TD
    subgraph Upload["Photo Upload"]
        EXIF["Extract EXIF\n(GPS coords, timestamp)"]
        Store["Store image row\n(lat, lng, captured_at)"]
        EXIF --> Store
    end

    Store -->|"has GPS"| AutoResolve
    Store -->|"no GPS"| NoGPS

    subgraph AutoResolve["Automatic Address Resolution (async, after upload)"]
        GPS["Image has GPS\n(latitude, longitude)"]
        Geocode["Reverse-geocode via\nNominatim API"]
        Parse["Parse structured response:\ncity, district, street,\ncountry, address_label"]
        UpdateAuto["UPDATE images SET\ncity, district, street,\ncountry, address_label,\nlocation_unresolved = false"]
        GPS --> Geocode --> Parse --> UpdateAuto
    end

    subgraph NoGPS["No GPS — User Must Provide Location"]
        Choice{"User chooses\nmethod"}
        DragPin["Drag-and-drop pin\non map (placement mode)"]
        EnterAddr["Enter address text\n(single or bulk-select)"]
        Choice --> DragPin
        Choice --> EnterAddr
    end

    DragPin -->|"lat/lng from map click"| ReverseFromPin
    EnterAddr -->|"address string"| ForwardGeo

    subgraph ReverseFromPin["Reverse Geocode from Pin"]
        PinCoords["Pin coordinates\n(lat, lng)"]
        RevGeo["Reverse-geocode via\nNominatim API"]
        UpdatePin["UPDATE images SET\nlat, lng, city, district,\nstreet, country, address_label"]
        PinCoords --> RevGeo --> UpdatePin
    end

    subgraph ForwardGeo["Forward Geocode from Address"]
        AddrInput["User-entered address"]
        FwdGeo["Forward-geocode via\nNominatim API"]
        FwdResult["Get lat, lng +\ncity, district, street,\ncountry, address_label"]
        UpdateFwd["UPDATE images SET\nlat, lng, city, district,\nstreet, country, address_label"]
        AddrInput --> FwdGeo --> FwdResult --> UpdateFwd
    end

    subgraph OnLoad["On-Load Resolution (when images are displayed)"]
        Load["Images loaded via\ncluster_images RPC"]
        Check{"Any image has GPS\nbut missing city/district/street?"}
        Resolve["Background reverse-geocode\n(grouped by exact GPS match,\nrate-limited 1 req/sec)"]
        PatchUI["Patch local signal +\nUPDATE DB rows"]
        Load --> Check
        Check -->|"yes"| Resolve --> PatchUI
        Check -->|"no"| Done["All address data present"]
    end

    UpdateAuto --> LoadRPC
    UpdatePin --> LoadRPC
    UpdateFwd --> LoadRPC

    subgraph Grouping["Client-side Grouping"]
        LoadRPC["cluster_images RPC\nreturns city, district,\nstreet, country, user_name"]
        ClientGroup["WorkspaceViewService\ngetGroupValue() reads\nstructured fields"]
        LoadRPC --> ClientGroup
    end

    LoadRPC --> Load
```

> **Note:** On-load resolution is a safety net — it catches images where the upload-time geocode failed or was skipped (e.g., old data, manual pin placement before geocoding was wired). Once resolved, the address data persists in the DB and is never re-fetched.

---

## Data Flow: Date-Derived Groupings

```mermaid
flowchart LR
    subgraph Source["captured_at (EXIF timestamp)"]
        TS["2025-06-15T14:30:00Z"]
    end

    subgraph Derived["Client-side Derivation"]
        Date["Date: June 15, 2025"]
        Month["Month: June 2025"]
        Year["Year: 2025"]
    end

    TS --> Date
    TS --> Month
    TS --> Year
```

No extra DB columns needed — `captured_at` is parsed on the client into date, month, or year labels.

---

## Data Flow: User Grouping

```mermaid
flowchart LR
    subgraph DB["Database"]
        ImgRow["images.user_id"]
        Profile["profiles.full_name"]
    end

    subgraph RPC["cluster_images RPC"]
        Join["LEFT JOIN profiles\nON user_id = profiles.id"]
        Return["Return user_name\nin result set"]
    end

    ImgRow --> Join
    Profile --> Join
    Join --> Return
```

The `cluster_images` RPC joins `profiles` to return the uploader's name alongside each image.

---

## Use Cases

### UC-G1: Grouping by City (address already resolved)

**Precondition:** Images have been reverse-geocoded; `city` column is populated.

```mermaid
sequenceDiagram
    actor User
    participant Toolbar as WorkspaceToolbar
    participant GroupDD as GroupingDropdown
    participant WVS as WorkspaceViewService
    participant Content as WorkspaceContent

    User->>Toolbar: Click "Grouping" button
    Toolbar->>GroupDD: Open dropdown
    User->>GroupDD: Click "City" in Available
    GroupDD->>WVS: groupingsChanged([{id: 'city'}])
    WVS->>WVS: getGroupValue(img, 'city') → img.city ?? "Unknown city"
    WVS-->>Content: GroupedSection[] by city
    Content->>Content: Headers: "Wien (180)", "Liesing (130)", etc.
```

### UC-G2: Grouping by Year

**Precondition:** Images have `captured_at` timestamps from EXIF.

```mermaid
sequenceDiagram
    actor User
    participant GroupDD as GroupingDropdown
    participant WVS as WorkspaceViewService
    participant Content as WorkspaceContent

    User->>GroupDD: Click "Year" in Available
    GroupDD->>WVS: groupingsChanged([{id: 'year'}])
    WVS->>WVS: getGroupValue(img, 'year') → new Date(img.capturedAt).getFullYear().toString()
    WVS-->>Content: GroupedSection[] by year
    Content->>Content: Headers: "2025 (1800)", "2026 (700)"
```

### UC-G3: Grouping by Street

**Precondition:** Images have been reverse-geocoded; `street` column is populated.

```mermaid
sequenceDiagram
    actor User
    participant GroupDD as GroupingDropdown
    participant WVS as WorkspaceViewService
    participant Content as WorkspaceContent

    User->>GroupDD: Click "Street" in Available
    GroupDD->>WVS: groupingsChanged([{id: 'street'}])
    WVS->>WVS: getGroupValue(img, 'street') → img.street ?? "Unknown street"
    WVS-->>Content: GroupedSection[] by street
    Content->>Content: Headers: "Seestadt-Straße (280)", "Nordbahnstraße (200)", ...
```

### UC-G4: Multi-level — Country → City → Project

```mermaid
flowchart TD
    subgraph Nested["Country → City → Project"]
        H_AT["▼ Austria — 2500 photos"]
        H_AT_W["  ▼ Wien — 2300 photos"]
        H_AT_W_P1["    ▸ Aspern Seestadt D12 — 440"]
        G1["    🖼 × 440"]
        H_AT_W_P2["    ▸ DC Tower 3 — 260"]
        G2["    🖼 × 260"]
        H_AT_W_P3["    ▸ Nordbahnviertel — 320"]
        G3["    🖼 × 320"]
        H_AT_L["  ▼ Liesing — 200 photos"]
        H_AT_L_P1["    ▸ Liesing Gewerbepark — 200"]
        G4["    🖼 × 200"]
    end
```

### UC-G5: Grouping by User

```mermaid
sequenceDiagram
    actor User
    participant GroupDD as GroupingDropdown
    participant WVS as WorkspaceViewService
    participant Content as WorkspaceContent

    User->>GroupDD: Click "User" in Available
    GroupDD->>WVS: groupingsChanged([{id: 'user'}])
    WVS->>WVS: getGroupValue(img, 'user') → img.userName ?? "Unknown user"
    WVS-->>Content: GroupedSection[] by user
    Content->>Content: Headers: "Markus Gruber (600)", "Anna Steiner (500)", ...
```

### UC-G6: Address Fields Not Yet Resolved — On-Load Background Resolution

**Precondition:** Fresh upload or old data; reverse geocoding hasn't run yet. Images have GPS but no address fields.

```mermaid
sequenceDiagram
    actor User
    participant Map as MapShell
    participant WVS as WorkspaceViewService
    participant Geo as GeocodingService
    participant DB as Supabase (images)
    participant Content as WorkspaceContent

    User->>Map: Click cluster marker
    Map->>WVS: loadClusterImages(lat, lng, zoom)
    WVS->>DB: RPC cluster_images(...)
    DB-->>WVS: images[] (city=null, district=null, street=null)
    WVS-->>Content: GroupedSection[] → "Unknown city (40 photos)"

    Note over WVS,Geo: Background: resolveUnresolvedAddresses()
    loop For each unique GPS coordinate
        WVS->>Geo: reverse(lat, lng)
        Geo->>Geo: Rate-limit (1 req/sec)
        Geo-->>WVS: {city, district, street, country, addressLabel}
        WVS->>DB: UPDATE images SET city, district, ... WHERE id IN (...)
        WVS->>WVS: Patch rawImages signal with resolved fields
        WVS-->>Content: GroupedSection[] updates live
    end
    Content->>Content: Headers change: "Wien (40 photos)", "Leopoldstadt", etc.
```

### UC-G7: Photo Without EXIF — Pin Placement → Reverse Geocode

**Precondition:** User uploads a photo without EXIF GPS data. No coordinates or address are known.

```mermaid
sequenceDiagram
    actor User
    participant Upload as UploadPanel
    participant Map as MapShell
    participant US as UploadService
    participant Geo as GeocodingService
    participant DB as Supabase (images)

    User->>Upload: Drop photo (no EXIF GPS)
    Upload->>Upload: parseExif() → no coords
    Upload->>Map: Enter placement mode
    Map->>Map: Show crosshair cursor + banner
    User->>Map: Click location on map
    Map->>Upload: Placement coords (lat, lng)
    Upload->>US: uploadFile(file, manualCoords)
    US->>DB: INSERT image (lat, lng, location_unresolved=true)
    US->>Geo: reverse(lat, lng)
    Geo-->>US: {city, district, street, country, addressLabel}
    US->>DB: UPDATE images SET city, district, ... WHERE id = ...
    Note over DB: Image now has GPS + full address data
```

### UC-G8: Photo Without EXIF — Manual Address Entry → Forward Geocode

**Precondition:** User uploads a photo without EXIF GPS data. User enters an address instead of placing a pin.

```mermaid
sequenceDiagram
    actor User
    participant Upload as UploadPanel
    participant ARS as AddressResolverService
    participant Geo as GeocodingAdapter
    participant US as UploadService
    participant DB as Supabase (images)

    User->>Upload: Drop photo (no EXIF GPS)
    Upload->>Upload: parseExif() → no coords
    User->>Upload: Type address in address field
    Upload->>ARS: resolve("Burgstraße 7")
    ARS->>Geo: forward-geocode query
    Geo-->>ARS: candidates[] with lat, lng, structured address
    ARS-->>Upload: Show autocomplete dropdown
    User->>Upload: Select "Burgstraße 7, 1010 Wien"
    Upload->>US: uploadFile(file, {lat, lng})
    US->>DB: INSERT image (lat, lng, city, district, street, country, address_label)
    Note over DB: Image has GPS + full address from forward geocode
```

### UC-G9: Bulk Address Entry — Select Multiple Photos

**Precondition:** Multiple uploaded photos without GPS data. User selects them and enters an address for all.

```mermaid
sequenceDiagram
    actor User
    participant Grid as ThumbnailGrid
    participant Detail as BatchEditPanel
    participant ARS as AddressResolverService
    participant Geo as GeocodingAdapter
    participant DB as Supabase (images)

    User->>Grid: Select multiple photos (Ctrl+Click)
    User->>Detail: Click "Set Location"
    User->>Detail: Type address "Seestadt-Straße, 1220 Wien"
    Detail->>ARS: resolve("Seestadt-Straße, 1220 Wien")
    ARS->>Geo: forward-geocode query
    Geo-->>ARS: {lat, lng, city, district, street, country, addressLabel}
    ARS-->>Detail: Show candidates
    User->>Detail: Confirm selection
    Detail->>DB: UPDATE images SET lat, lng, city, district, ... WHERE id IN (selected_ids)
    Note over DB: All selected images now have GPS + address data
```

---

## Address Resolution Strategies

```mermaid
flowchart TD
    subgraph Triggers["Resolution Triggers"]
        T1["Upload with EXIF GPS"]
        T2["Pin placement\n(drag-and-drop on map)"]
        T3["Manual address entry\n(single or multi-select)"]
        T4["Marker correction\n(move existing pin)"]
        T5["On-load detection\n(images displayed in workspace)"]
    end

    subgraph Reverse["Reverse Geocode (GPS → Address)"]
        Rev["Nominatim reverse API\nlat, lng → structured address"]
    end

    subgraph Forward["Forward Geocode (Address → GPS)"]
        Fwd["Nominatim forward API\naddress → lat, lng + structured"]
    end

    T1 -->|"has GPS"| Rev
    T2 -->|"map click coords"| Rev
    T4 -->|"new pin coords"| Rev
    T5 -->|"has GPS, missing address"| Rev

    T3 -->|"address string"| Fwd

    Rev --> Result["UPDATE images:\ncity, district, street,\ncountry, address_label,\nlocation_unresolved = false"]
    Fwd --> ResultFwd["UPDATE images:\nlat, lng, city, district,\nstreet, country, address_label,\nlocation_unresolved = false"]
```

| Trigger                            | Method                   | Fields Populated                                                                  | Timing                 |
| ---------------------------------- | ------------------------ | --------------------------------------------------------------------------------- | ---------------------- |
| Upload with EXIF GPS               | Reverse geocode GPS→addr | `address_label`, `city`, `district`, `street`, `country`                          | Async, after insert    |
| Pin placement (no EXIF)            | Reverse geocode GPS→addr | `address_label`, `city`, `district`, `street`, `country`                          | Async, after insert    |
| Manual address entry (single/bulk) | Forward geocode addr→GPS | `latitude`, `longitude`, `address_label`, `city`, `district`, `street`, `country` | On confirm             |
| Marker correction                  | Reverse geocode new GPS  | Updates all address fields for new location                                       | Async, after move      |
| Folder import (filename hint)      | Forward geocode hint→GPS | All address fields + coordinates                                                  | Batch, during import   |
| On-load detection (workspace view) | Reverse geocode GPS→addr | `address_label`, `city`, `district`, `street`, `country`                          | Background, on display |

All strategies ultimately populate the same structured columns on the `images` table.
