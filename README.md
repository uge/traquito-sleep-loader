
This is a small pico-sdk based project to act as a sleep manager for
Traquito firmware. 

## Address map modifications

The RP2040 flash address map puts the boot2 bootloader at the 
base of flash and has a 256 byte region which is copied into
SRAM by the ROM and executed. The job of the boot2 code is to
set up the QSPI flash, enable the XIP (execute in place) engine
to map the flash as a region of memory, and to jump to the user
application via the vectors at the base of the image located at
0x100 in the flash (just after the boot2 code).

This hack requires a modified boot2 which will jump to 
0x1018_0000 instead of 0x1000_0100 (leaving the Traquito
firmware unchanged). 

