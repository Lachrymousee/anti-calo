// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;






interface ITicketNFT {

    enum EventStatus {
        Active,
        Canceled
    }


    enum TicketStatus {
        Valid,
        Used,
        Revoked
    }


    struct EventInfo {
        address organizer;
        uint64 saleStart;
        uint16 resaleCapBps;
        EventStatus status;
        uint64 saleEnd;
        uint64 eventTime;
        uint32 maxSupply;
        uint32 sold;
        uint32 maxPerWallet;
        uint256 ticketPrice;
        bytes32 detailsHash;
    }


    struct EventParams {
        uint256 ticketPrice;
        uint32 maxSupply;
        uint32 maxPerWallet;
        uint64 saleStart;
        uint64 saleEnd;
        uint64 eventTime;
        uint16 resaleCapBps;
        bytes32 detailsHash;
    }


    struct TicketInfo {
        uint256 eventId;
        TicketStatus status;
        uint256 originalPrice;
    }


    function getEvent(uint256 eventId) external view returns (EventInfo memory);


    function getTicket(uint256 tokenId) external view returns (TicketInfo memory);


    function getResaleCap(uint256 tokenId) external view returns (uint256);


    function isTransferable(uint256 tokenId) external view returns (bool);



    function transferByMarketplace(address from, address to, uint256 tokenId) external;


    function receiveResaleFee(uint256 eventId) external payable;
}
