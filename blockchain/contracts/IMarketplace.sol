// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;








interface IMarketplace {





    struct Listing {
        address seller;
        uint256 price;
    }






    event Listed(uint256 indexed tokenId, uint256 indexed eventId, address indexed seller, uint256 price);


    event ListingCanceled(uint256 indexed tokenId, address indexed seller);


    event Sold(
        uint256 indexed tokenId,
        uint256 indexed eventId,
        address indexed buyer,
        address seller,
        uint256 price,
        uint256 fee
    );


    event ProceedsWithdrawn(address indexed seller, uint256 amount);





    error ZeroAddress();
    error InvalidFee();
    error ZeroPrice();
    error NotTicketHolder(uint256 tokenId, address caller);
    error TicketNotTransferable(uint256 tokenId);
    error PriceAboveCap(uint256 tokenId, uint256 price, uint256 cap);
    error AlreadyListed(uint256 tokenId);
    error NotListed(uint256 tokenId);
    error NotSeller(uint256 tokenId, address caller);
    error CannotBuyOwnListing();
    error IncorrectPayment(uint256 expected, uint256 sent);
    error StaleListing(uint256 tokenId);
    error NoProceeds();
    error EthTransferFailed();






    function ticketNft() external view returns (address);


    function feeBps() external view returns (uint16);


    function MAX_FEE_BPS() external view returns (uint16);






    function listTicket(uint256 tokenId, uint256 price) external;


    function cancelListing(uint256 tokenId) external;


    function withdrawProceeds() external;






    function buyListing(uint256 tokenId) external payable;







    function getListing(uint256 tokenId) external view returns (Listing memory);


    function pendingProceeds(address seller) external view returns (uint256);


    function quoteSale(uint256 price) external view returns (uint256 fee, uint256 sellerAmount);
}
