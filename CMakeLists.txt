cmake_minimum_required(VERSION 3.13)

set(PICO_SDK_FETCH_FROM_GIT on)
set(PICO_EXTRAS_FETCH_FROM_GIT on)

include(${CMAKE_SOURCE_DIR}/pico_sdk_import.cmake)
include(${CMAKE_SOURCE_DIR}/pico_extras_import.cmake)

project(test_project C CXX ASM)
set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 17)
pico_sdk_init()
add_executable(test
  test.c
)
set_target_properties(test PROPERTIES PICO_TARGET_LINKER_SCRIPT ${CMAKE_SOURCE_DIR}/memmap_custom.ld)

pico_add_extra_outputs(test)
target_link_libraries(test pico_stdlib hardware_adc hardware_clocks hardware_sleep hardware_rtc)
