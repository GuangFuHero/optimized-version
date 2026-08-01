#!/usr/bin/env bash
# Common functions and variables for all scripts

# Layout (see specs/README.md):
#   specs/<version>/<NN-feature>/          product layer: user-stories.md, prd.md, research/
#   specs/<version>/<NN-feature>/engineering/   engineering layer: spec.md, plan.md, tasks.md, ...
# Feature numbers are 2- or 3-digit. Versions are release milestones (v1, v2, ...).

# Root of the specs tree
get_specs_root() { echo "$(get_repo_root)/specs"; }

# Version new work lands in. Resolution order:
#   1. SPECIFY_VERSION environment variable
#   2. specs/ACTIVE_VERSION file (the declared answer — edit that file to cut a release)
#   3. highest vN directory present
# The active version is declared rather than inferred: a v2 directory can exist as a
# backlog long before v2 becomes the version being specced.
get_active_version() {
    if [[ -n "${SPECIFY_VERSION:-}" ]]; then
        echo "$SPECIFY_VERSION"
        return
    fi

    local specs_root="$(get_specs_root)"

    if [[ -f "$specs_root/ACTIVE_VERSION" ]]; then
        local declared
        declared="$(tr -d '[:space:]' < "$specs_root/ACTIVE_VERSION")"
        if [[ -n "$declared" ]]; then
            echo "$declared"
            return
        fi
    fi

    local latest="" highest=-1
    for dir in "$specs_root"/v*; do
        [[ -d "$dir" ]] || continue
        local name="$(basename "$dir")"
        if [[ "$name" =~ ^v([0-9]+)$ ]]; then
            local n=$((10#${BASH_REMATCH[1]}))
            if [[ "$n" -gt "$highest" ]]; then
                highest=$n
                latest="$name"
            fi
        fi
    done

    echo "${latest:-v1}"
}

# Get project root by finding .specify/ directory
# .specify/ lives at the repository root, so this works from any subdirectory
get_repo_root() {
    # First try to find .specify/ from current directory upward
    local dir="$PWD"
    while [[ "$dir" != "/" ]]; do
        if [[ -d "$dir/.specify" ]]; then
            echo "$dir"
            return
        fi
        dir="$(dirname "$dir")"
    done

    # Fall back to script location
    local script_dir="$(CDPATH="" cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    (cd "$script_dir/../../.." && pwd)
}

# Get current branch, with fallback for non-git repositories
get_current_branch() {
    # First check if SPECIFY_FEATURE environment variable is set
    if [[ -n "${SPECIFY_FEATURE:-}" ]]; then
        echo "$SPECIFY_FEATURE"
        return
    fi

    # Then check git if available
    if git rev-parse --abbrev-ref HEAD >/dev/null 2>&1; then
        git rev-parse --abbrev-ref HEAD
        return
    fi

    # For non-git repos, try to find the latest feature directory in the active version
    local specs_dir="$(get_specs_root)/$(get_active_version)"

    if [[ -d "$specs_dir" ]]; then
        local latest_feature=""
        local highest=0

        for dir in "$specs_dir"/*; do
            if [[ -d "$dir" ]]; then
                local dirname=$(basename "$dir")
                if [[ "$dirname" =~ ^([0-9]{2,3})- ]]; then
                    local number=${BASH_REMATCH[1]}
                    number=$((10#$number))
                    if [[ "$number" -gt "$highest" ]]; then
                        highest=$number
                        latest_feature=$dirname
                    fi
                fi
            fi
        done

        if [[ -n "$latest_feature" ]]; then
            echo "$latest_feature"
            return
        fi
    fi

    echo "main"  # Final fallback
}

# Check if we have git available
has_git() {
    git rev-parse --show-toplevel >/dev/null 2>&1
}

check_feature_branch() {
    local branch="$1"
    local has_git_repo="$2"

    # For non-git repos, we can't enforce branch naming but still provide output
    if [[ "$has_git_repo" != "true" ]]; then
        echo "[specify] Warning: Git repository not detected; skipped branch validation" >&2
        return 0
    fi

    if [[ ! "$branch" =~ ^[0-9]{2,3}- ]]; then
        echo "ERROR: Not on a feature branch. Current branch: $branch" >&2
        echo "Feature branches should be named like: 05-member-management or 001-feature-name" >&2
        return 1
    fi

    return 0
}

# Product-layer directory for a feature: <repo_root> <NN-feature> [version]
get_feature_dir() { echo "$(get_specs_root)/${3:-$(get_active_version)}/$2"; }

# Find a feature's product-layer directory by numeric prefix instead of exact branch match.
# Searches every version directory, so a branch keeps resolving after a feature is
# promoted from one release to the next.
find_feature_dir_by_prefix() {
    local repo_root="$1"
    local branch_name="$2"
    local specs_root="$(get_specs_root)"
    local specs_dir="$specs_root/$(get_active_version)"

    # Extract numeric prefix from branch (e.g., "05" from "05-whatever")
    if [[ ! "$branch_name" =~ ^([0-9]{2,3})- ]]; then
        # If branch doesn't have numeric prefix, fall back to exact match in the active version
        echo "$specs_dir/$branch_name"
        return
    fi

    local prefix="${BASH_REMATCH[1]}"

    # Search every version directory for a feature with this prefix
    local matches=()
    for version_dir in "$specs_root"/v*; do
        [[ -d "$version_dir" ]] || continue
        for dir in "$version_dir"/"$prefix"-*; do
            if [[ -d "$dir" ]]; then
                matches+=("$(basename "$version_dir")/$(basename "$dir")")
            fi
        done
    done

    # Handle results
    if [[ ${#matches[@]} -eq 0 ]]; then
        # No match found - return the branch name path (will fail later with clear error)
        echo "$specs_dir/$branch_name"
    elif [[ ${#matches[@]} -eq 1 ]]; then
        # Exactly one match - perfect!
        echo "$specs_root/${matches[0]}"
    else
        # Multiple matches - a feature must live in exactly one version directory
        echo "ERROR: Multiple spec directories found with prefix '$prefix': ${matches[*]}" >&2
        echo "A feature belongs to exactly one version; move or merge the duplicates." >&2
        echo "$specs_dir/$branch_name"  # Return something to avoid breaking the script
    fi
}

get_feature_paths() {
    local repo_root=$(get_repo_root)
    local current_branch=$(get_current_branch)
    local has_git_repo="false"

    if has_git; then
        has_git_repo="true"
    fi

    # Use prefix-based lookup to support multiple branches per spec
    local product_dir=$(find_feature_dir_by_prefix "$repo_root" "$current_branch")
    # Engineering artefacts live one level down so they never collide with the
    # product layer's own research/ directory.
    local feature_dir="$product_dir/engineering"

    cat <<EOF
REPO_ROOT='$repo_root'
CURRENT_BRANCH='$current_branch'
HAS_GIT='$has_git_repo'
SPECS_ROOT='$(get_specs_root)'
VERSION='$(get_active_version)'
PRODUCT_DIR='$product_dir'
USER_STORIES='$product_dir/user-stories.md'
PRD='$product_dir/prd.md'
FEATURE_DIR='$feature_dir'
FEATURE_SPEC='$feature_dir/spec.md'
IMPL_PLAN='$feature_dir/plan.md'
TASKS='$feature_dir/tasks.md'
RESEARCH='$feature_dir/research.md'
DATA_MODEL='$feature_dir/data-model.md'
QUICKSTART='$feature_dir/quickstart.md'
CONTRACTS_DIR='$feature_dir/contracts'
EOF
}

check_file() { [[ -f "$1" ]] && echo "  ✓ $2" || echo "  ✗ $2"; }
check_dir() { [[ -d "$1" && -n $(ls -A "$1" 2>/dev/null) ]] && echo "  ✓ $2" || echo "  ✗ $2"; }

