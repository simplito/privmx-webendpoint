#!/bin/bash
set -e
set -o pipefail

SCRIPT_PATH=$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )
source "$SCRIPT_PATH/build-manifest.sh"

# ==============================================================================
# CONFIGURATION
# ==============================================================================
RED=$(tput setaf 1)
GREEN=$(tput setaf 2)
BLUE=$(tput setaf 4)
GRAY=$(tput setaf 8 2>/dev/null || tput setaf 240)
RESET=$(tput sgr0)

# Height of the streaming window (Header + N lines of logs)
# e.g., 6 means 1 header line + 5 log lines
WINDOW_SIZE=20

# Hide cursor
tput civis 
cleanup() {
    tput cnorm
    rm -f /tmp/build_*.log /tmp/build_*.log.tmp
}
trap cleanup EXIT

# ==============================================================================
# BUILD FUNCTION
# ==============================================================================
run_step() {
    local step_name="$1"
    shift
    
    local log_file="/tmp/build_${step_name}.log"
    local pid
    local spin='-\|/'
    local i=0
    local term_width=$(tput cols)
    local max_len=$((term_width - 5))

    # 1. Run command in background
    ("$@" > "$log_file" 2>&1) &
    pid=$!

    # 2. Reserve Space (Padding)
    for ((k=0; k<WINDOW_SIZE; k++)); do echo ""; done

    # 3. Render Loop
    while kill -0 "$pid" 2>/dev/null; do
        # Go to top of window
        tput cuu "$WINDOW_SIZE"

        # Header
        i=$(( (i+1) %4 ))
        printf "\r${BLUE}⚙️  Building %s... [%s]${RESET}" "$step_name" "${spin:$i:1}"
        tput el 
        printf "\n"

        # Logs
        if [ -f "$log_file" ]; then
            tail -n $((WINDOW_SIZE - 1)) "$log_file" > "${log_file}.tmp"
            local line_count=$(wc -l < "${log_file}.tmp")
            line_count="${line_count##*( )}"

            while IFS= read -r line; do
                short_line=$(echo "$line" | cut -c 1-"$max_len")
                printf "${GRAY}  > %s${RESET}" "$short_line"
                tput el 
                printf "\n"
            done < "${log_file}.tmp"

            local remaining=$(( (WINDOW_SIZE - 1) - line_count ))
            for ((j=0; j<remaining; j++)); do
                tput el; printf "\n"
            done
        else
            for ((j=0; j<(WINDOW_SIZE - 1); j++)); do
                tput el; printf "\n"
            done
        fi
        sleep 0.1
    done

    # 4. Finalize
    set +e 
    wait "$pid"
    local exit_code=$?
    set -e 
    # --- FIX END ---

    # Wróć na górę okna po raz ostatni
    tput cuu "$WINDOW_SIZE"
    
    # Wyczyść CAŁE okno w dół (usuwa logi i puste linie)
    tput ed

    # Poniżej usuń wszelkie 'echo $exit_code', które mogłeś dodać (to one robią '0' przed fajką)
    if [ $exit_code -eq 0 ]; then
        # SUKCES
        printf "${GREEN} %s - SUCCESS${RESET}\n" "$step_name"
        rm -f "$log_file" "${log_file}.tmp"
    else
        # BŁĄD
        printf "${RED}❌ %s - FAILED${RESET}\n" "$step_name"
        printf "${RED}==================== FAILURE LOGS (Last 100 lines) ====================${RESET}\n"
        
        printf "${RED}"
        # Pokazujemy ostatnie 100 linii, bo błąd make często jest wyżej niż na samym dnie
        tail -n 100 "$log_file"
        printf "${RESET}\n"
        
        printf "${RED}=======================================================================${RESET}\n"
        rm -f "$log_file" "${log_file}.tmp"
        exit 1
    fi
}

# ==============================================================================
# EXECUTION
# ==============================================================================
echo "${BLUE}----------------------------------------"
echo " Starting Build Process..."
echo "---------------------------------------${RESET}"

run_step "Download and Install Emscripten SDK" "$SCRIPT_PATH/get_emsdk"
run_step "Build GMP Library" "$SCRIPT_PATH/build_gmp" $GMP
run_step "Build POCO C++ Libraries" "$SCRIPT_PATH/build_poco" $POCO
run_step "Build PSON C++ Library" "$SCRIPT_PATH/build_pson" $PSON_CPP
run_step "Build secp256k1 Cryptography Library" "$SCRIPT_PATH/build_secp"
run_step "Build Async Engine" "$SCRIPT_PATH/build_async_engine"
run_step "Build Web Browser Drivers" "$SCRIPT_PATH/build_webdrivers"
run_step "Build PrivMX Endpoint Module" "$SCRIPT_PATH/build_privmx_endpoint" $PRIVMX_ENDPOINT
run_step "Build Driver Web Context" "$SCRIPT_PATH/build_driver_web_context"
run_step "Build API Interface" "$SCRIPT_PATH/build_api" $PRIVMX_ENDPOINT
run_step "Add Built Assets to package" "$SCRIPT_PATH/move_wasm_assets"

echo "${BLUE}----------------------------------------"
printf " ALL BUILDS FINISHED SUCCESSFULLY\n"
echo "----------------------------------------${RESET}"
